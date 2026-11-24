'use strict';
const crypto = require('crypto');
const prisma = require('../config/database');
const config = require('../config');
const orderRepository = require('../repositories/orderRepository');
const { paymentRepository, webhookEventRepository } = require('../repositories/paymentRepository');
const { createPaymentProvider } = require('../patterns/payment/PaymentProviderFactory');
const orderEvents = require('../patterns/observer/orderEvents');
const { PAID_STATES } = require('./orderStateMachine');
const { Errors } = require('../utils/errors');
const logger = require('../utils/logger');
const dto = require('../utils/dto');

/**
 * FAÇADE (structural) – PaymentService.
 * Controllers call ONE method each (createSession, handleWebhook,
 * verifyOnReturn, adminReconcile). Everything gateway-specific – which
 * provider, HTTP calls, webhook verification, status mapping, amount
 * checks, idempotent event storage, stock commit/release – stays behind
 * this façade.
 *
 * Golden rule: an order becomes `paid` ONLY after the backend has fetched
 * the payment from the gateway API itself and verified status + amount +
 * currency. Redirects and webhook bodies are treated as hints, never proof.
 */
class PaymentService {
  constructor({ orderService, inventoryService, providerFactory = createPaymentProvider,
    payments = paymentRepository, webhookEvents = webhookEventRepository, orders = orderRepository,
    db = prisma, events = orderEvents }) {
    this.orderService = orderService;
    this.inventory = inventoryService;
    this.providerFactory = providerFactory;
    this.payments = payments;
    this.webhookEvents = webhookEvents;
    this.orders = orders;
    this.db = db;
    this.events = events;
  }

  // ------------------------------------------------------------ session creation

  async createSession(order, buyer) {
    const provider = this.providerFactory();
    const requestReference = `${order.orderNumber}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const base = `${config.frontendUrl}/payment`;
    const redirectUrls = {
      success: `${base}/success?orderId=${order.id}`,
      failure: `${base}/cancelled?orderId=${order.id}&reason=failed`,
      cancel: `${base}/cancelled?orderId=${order.id}`,
    };
    const { gatewayRef, checkoutUrl } = await provider.createCheckout({ order, items: order.items, requestReference, redirectUrls, buyer });
    await this.db.$transaction(async (tx) => {
      await this.payments.supersedePending(order.id, tx);
      await this.payments.create({
        orderId: order.id, provider: provider.name, gatewayRef, requestReference, checkoutUrl,
        amountCents: order.totalCents, currency: order.currency,
      }, tx);
    });
    return { provider: provider.name, gatewayRef, checkoutUrl };
  }

  /** L2-07: customer retries payment with a NEW session after a failure/cancel. */
  async retrySession(user, orderId) {
    const order = await this.orders.findForUser(orderId, user.id);
    if (!order) throw Errors.notFound('Order');
    if (order.status !== 'pending_payment') {
      throw Errors.conflict('ORDER_NOT_PAYABLE', `Order is ${order.status}; only pending_payment orders can be paid`);
    }
    await this.db.$transaction(async (tx) => {
      const active = await this.inventory.hasActiveReservations(order.id, tx);
      if (active) {
        await tx.stockReservation.updateMany({ where: { orderId: order.id, status: 'active' }, data: { expiresAt: this.inventory.expiryFromNow() } });
      } else {
        // stock was returned after the failed attempt – take it again (409 if gone)
        await this.inventory.reserve(order.id, order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, name: i.productName })), tx);
      }
    });
    const session = await this.createSession(order, { name: order.shipName, email: user.email });
    return { order: dto.order(await this.orders.findById(order.id)), checkoutUrl: session.checkoutUrl };
  }

  // ------------------------------------------------------------ webhooks (L2-05)

  async handleWebhook(providerName, { rawBody, headers, query, ip }) {
    const provider = this.providerFactory(providerName);
    try {
      provider.verifyWebhook({ rawBody, headers, query, ip });
    } catch (err) {
      logger.warn('webhook.rejected', { provider: providerName, reason: err.reason, ip });
      throw err; // 401, nothing stored, no order touched
    }

    const evt = provider.parseWebhookEvent(rawBody);
    let payload;
    try { payload = JSON.parse(rawBody.toString('utf8')); } catch { payload = { unparsable: true }; }

    let stored = await this.webhookEvents.insertIfNew({ provider: providerName, eventId: evt.eventId, type: evt.type, payload });
    if (!stored) {
      const existing = await this.db.webhookEvent.findUnique({ where: { provider_eventId: { provider: providerName, eventId: evt.eventId } } });
      if (existing.status !== 'failed') {
        logger.info('webhook.duplicate', { provider: providerName, eventId: evt.eventId });
        return { received: true, duplicate: true };
      }
      stored = existing; // a previous attempt failed – safe to retry processing
    }

    if (!evt.actionable) {
      await this.webhookEvents.markStatus(stored.id, 'ignored', `Unhandled event type ${evt.type}`);
      return { received: true, ignored: true };
    }

    let payment = evt.gatewayRef ? await this.payments.findByGatewayRef(evt.gatewayRef) : null;
    if (!payment && evt.requestReference) payment = await this.payments.findByRequestReference(evt.requestReference);
    if (!payment) {
      await this.webhookEvents.markStatus(stored.id, 'ignored', 'No matching payment');
      return { received: true, ignored: true };
    }

    try {
      const result = await this.reconcilePayment(payment, { trigger: 'webhook' });
      await this.webhookEvents.markStatus(stored.id, 'processed');
      return { received: true, processed: true, outcome: result.outcome };
    } catch (err) {
      await this.webhookEvents.markStatus(stored.id, 'failed', err.code || err.message);
      throw err; // non-2xx so the gateway retries; reconciliation also covers it
    }
  }

  // ------------------------------------------------------------ verification / reconciliation (L2-06)

  /** Fetches the authoritative status from the gateway and applies it. */
  async reconcilePayment(payment, { trigger, actorId = null }) {
    const provider = this.providerFactory(payment.provider);
    const verified = await provider.retrievePayment(payment.gatewayRef);
    try {
      return await this.applyVerifiedStatus(payment.id, verified, { trigger, actorId });
    } catch (err) {
      if (err.code !== 'OUT_OF_STOCK') throw err;
      // Late payment for a cancelled/expired order whose stock is gone – flag for a manual refund.
      const reason = `LATE_PAYMENT_NO_STOCK: verified payment ${payment.gatewayRef} but stock could not be re-reserved – refund required`;
      const order = await this.db.$transaction(async (tx) => {
        await this.payments.update(payment.id, { status: 'paid' }, tx);
        return this.orders.update(payment.orderId, { paymentFlagged: true, flagReason: reason }, tx);
      });
      this.events.publishAll([{ name: 'payment.flagged', payload: { order, reason } }]);
      return { outcome: 'flagged_late_payment' };
    }
  }

  async applyVerifiedStatus(paymentId, verified, { trigger, actorId }) {
    const events = [];
    const result = await this.db.$transaction(async (tx) => {
      const pay = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: { include: { items: true } } } });
      const order = pay.order;
      await this.payments.update(pay.id, {
        gatewayStatus: verified.gatewayStatus, gatewayAmountCents: verified.amountCents, gatewayCurrency: verified.currency,
      }, tx);

      if (verified.status === 'paid') {
        // L2-09 amount + currency integrity
        if (verified.amountCents !== pay.amountCents || verified.currency !== pay.currency || pay.amountCents !== order.totalCents) {
          const reason = `AMOUNT_MISMATCH: expected ${pay.amountCents} ${pay.currency}, gateway reported ${verified.amountCents} ${verified.currency}`;
          await this.payments.update(pay.id, { status: 'mismatch' }, tx);
          await this.orders.update(order.id, { paymentFlagged: true, flagReason: reason }, tx);
          logger.warn('payment.amount_mismatch', { orderId: order.id, expectedCents: pay.amountCents, expectedCurrency: pay.currency, gatewayCents: verified.amountCents, gatewayCurrency: verified.currency });
          events.push({ name: 'payment.flagged', payload: { order, reason } });
          return { outcome: 'flagged_amount_mismatch' };
        }

        if (PAID_STATES.includes(order.status)) {
          if (pay.status === 'paid') return { outcome: 'already_paid' }; // idempotent replay
          const reason = `DUPLICATE_PAYMENT: second payment ${pay.gatewayRef} for an already-paid order – refund required`;
          await this.payments.update(pay.id, { status: 'paid' }, tx);
          await this.orders.update(order.id, { paymentFlagged: true, flagReason: reason }, tx);
          events.push({ name: 'payment.flagged', payload: { order, reason } });
          return { outcome: 'flagged_duplicate_payment' };
        }

        // pending_payment, or a late payment on cancelled/expired
        if (!(await this.inventory.hasActiveReservations(order.id, tx))) {
          await this.inventory.reserve(order.id, order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, name: i.productName })), tx);
        }
        await this.inventory.commit(order.id, tx);
        await this.payments.update(pay.id, { status: 'paid' }, tx);
        events.push(await this.orderService.applyTransition(tx, order, 'paid', {
          actorType: 'gateway', actorId,
          note: `Verified ${pay.provider} payment ${pay.gatewayRef} via ${trigger}${order.status !== 'pending_payment' ? ' (late payment recovered)' : ''}`,
          extra: { paidAt: new Date() },
        }));
        return { outcome: 'paid' };
      }

      if (['failed', 'cancelled', 'expired'].includes(verified.status)) {
        if (pay.status === 'pending') await this.payments.update(pay.id, { status: verified.status }, tx);
        const latest = await this.payments.latestForOrder(order.id, tx);
        if (order.status === 'pending_payment' && latest && latest.id === pay.id) {
          // L2-07: order stays unpaid, stock is returned, customer may retry
          await this.inventory.release(order.id, `Payment ${verified.status}`, tx);
          events.push({ name: 'payment.failed', payload: { order, paymentStatus: verified.status } });
        }
        return { outcome: `payment_${verified.status}` };
      }

      return { outcome: 'pending' };
    });
    this.events.publishAll(events);
    return result;
  }

  /** Retrieve-on-return: called by the /payment/success page. Informational + reconciliation. */
  async verifyOnReturn(user, orderId) {
    const order = await this.orders.findForUser(orderId, user.id);
    if (!order) throw Errors.notFound('Order');
    const latest = order.payments[0];
    let outcome = 'no_change';
    if (latest && order.status === 'pending_payment' && latest.status === 'pending') {
      try {
        outcome = (await this.reconcilePayment(latest, { trigger: 'return_page' })).outcome;
      } catch (err) {
        logger.warn('verifyOnReturn failed', { orderId, code: err.code });
        outcome = 'gateway_unreachable';
      }
    }
    return { outcome, order: dto.order(await this.orders.findById(orderId)) };
  }

  /** Admin "Reconcile with gateway" button – recovers orders whose webhook was missed. */
  async adminReconcile(admin, orderId) {
    const order = await this.orders.findById(orderId);
    if (!order) throw Errors.notFound('Order');
    const latest = order.payments[0];
    if (!latest) throw Errors.conflict('NO_PAYMENT_SESSION', 'This order has no payment session to reconcile');
    const { outcome } = await this.reconcilePayment(latest, { trigger: 'admin_reconcile', actorId: admin.id });
    const fresh = await this.orders.findById(orderId);
    return { outcome, order: dto.order(fresh, { admin: true }) };
  }

  /**
   * Scheduled job (every minute): for each pending order whose hold expired,
   * ask the gateway first (catches missed webhooks), then expire if still unpaid.
   */
  async sweepExpired(now = new Date()) {
    const cutoff = new Date(now.getTime() - config.payment.reservationTtlMinutes * 60 * 1000);
    const candidates = await this.orders.findExpiredPending(now, cutoff);
    let expired = 0;
    for (const { id } of candidates) {
      const order = await this.orders.findById(id);
      const latest = order.payments[0];
      if (latest && latest.status === 'pending') {
        try { await this.reconcilePayment(latest, { trigger: 'scheduled_sweep' }); } catch (err) {
          logger.warn('sweep reconcile failed – will retry next run', { orderId: id, code: err.code });
          continue; // never expire an order we could not check
        }
      }
      if (await this.orderService.expireOrder(id)) expired += 1;
    }
    return { checked: candidates.length, expired };
  }

  async webhookLog(q) {
    return this.webhookEvents.list(q);
  }
}

module.exports = PaymentService;
