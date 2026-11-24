'use strict';
const crypto = require('crypto');
const prisma = require('../config/database');
const orderRepository = require('../repositories/orderRepository');
const couponRepository = require('../repositories/couponRepository');
const cartRepository = require('../repositories/cartRepository');
const compatibility = require('./compatibilityService');
const orderEvents = require('../patterns/observer/orderEvents');
const { shippingOptions } = require('../patterns/shipping/shippingStrategies');
const { Errors } = require('../utils/errors');
const logger = require('../utils/logger');
const dto = require('../utils/dto');

/**
 * CheckoutService – COMPOSITION (T-18).
 * It HAS-A pricing service, inventory service, payment service (façade),
 * cart service, order repository and coupon repository, each injected
 * through the constructor. Nothing is inherited: each collaborator can be
 * replaced in tests, and a change to pricing cannot break inventory logic.
 */
class CheckoutService {
  constructor({ pricingService, inventoryService, paymentService, cartService,
    orders = orderRepository, coupons = couponRepository, carts = cartRepository, db = prisma, events = orderEvents }) {
    this.pricing = pricingService;
    this.inventory = inventoryService;
    this.payment = paymentService;
    this.cart = cartService;
    this.orders = orders;
    this.coupons = coupons;
    this.carts = carts;
    this.db = db;
    this.events = events;
  }

  static newOrderNumber() {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `BPC-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  async loadCheckableLines(userId) {
    const lines = await this.cart.loadLines(userId);
    if (!lines.length) throw Errors.validation('CART_EMPTY', 'Your cart is empty');
    const unavailable = lines.filter((l) => !l.product.isActive || l.product.deletedAt);
    if (unavailable.length) {
      throw Errors.conflict('PRODUCT_UNAVAILABLE', 'Some items are no longer sold – remove them from your cart',
        unavailable.map((l) => ({ productId: l.product.id, name: l.product.name })));
    }
    return lines;
  }

  async preview(user, { couponCode, shippingMethod }) {
    const lines = await this.loadCheckableLines(user.id);
    const quote = await this.pricing.quote({ lines, couponCode, userId: user.id, shippingMethod });
    return {
      ...quote,
      coupon: quote.coupon ? { code: quote.coupon.code, type: quote.coupon.type, value: quote.coupon.value } : null,
      compatibility: compatibility.evaluate(lines, { mode: 'cart' }),
      stockIssues: lines.filter((l) => l.product.stock < l.quantity).map((l) => ({ productId: l.product.id, name: l.product.name, available: l.product.stock })),
      shippingOptions: shippingOptions(),
    };
  }

  async replay(existing) {
    const latest = existing.payments[0];
    return {
      replayed: true,
      order: dto.order(existing),
      checkoutUrl: existing.status === 'pending_payment' && latest?.status === 'pending' ? latest.checkoutUrl : null,
      paymentError: null,
    };
  }

  /**
   * L1-06 / L2-02 / L2-03 / L2-08.
   * One transaction: price from DB -> create order + items + history ->
   * consume coupon -> reserve stock atomically -> clear cart.
   * If ANY step fails, everything rolls back (no order, no stock change).
   */
  async checkout(user, { couponCode, shippingMethod, shipping }, idempotencyKey) {
    const existing = await this.orders.findByIdempotencyKey(user.id, idempotencyKey);
    if (existing) return this.replay(existing);

    const lines = await this.loadCheckableLines(user.id);
    const report = compatibility.evaluate(lines, { mode: 'cart' });
    if (!report.compatible) {
      throw Errors.conflict('CART_INCOMPATIBLE', 'Some parts in your cart are not compatible with each other', report.errors);
    }

    let created;
    try {
      created = await this.db.$transaction(async (tx) => {
        const quote = await this.pricing.quote({ lines, couponCode, userId: user.id, shippingMethod, tx });
        const order = await this.orders.create({
          orderNumber: CheckoutService.newOrderNumber(),
          userId: user.id,
          status: 'pending_payment',
          currency: quote.currency,
          subtotalCents: quote.subtotalCents,
          discountCents: quote.discountCents,
          shippingFeeCents: quote.shippingFeeCents,
          totalCents: quote.totalCents,
          couponId: quote.coupon?.id || null,
          shippingMethod,
          shipName: shipping.name,
          shipPhone: shipping.phone,
          shipAddressLine: shipping.addressLine,
          shipCity: shipping.city,
          shipProvince: shipping.province,
          shipPostalCode: shipping.postalCode,
          idempotencyKey,
          items: {
            create: quote.lines.map((l) => ({
              productId: l.productId, productName: l.name, sku: l.sku,
              unitPriceCents: l.unitPriceCents, quantity: l.quantity, lineTotalCents: l.lineTotalCents,
            })),
          },
          statusHistory: { create: { toStatus: 'pending_payment', actorType: 'customer', actorId: user.id, note: 'Order placed' } },
        }, tx);

        if (quote.coupon) {
          const consumed = await this.coupons.incrementUsageIfAvailable(quote.coupon, tx);
          if (!consumed) throw Errors.validation('COUPON_EXHAUSTED', `Coupon ${quote.coupon.code} has reached its usage limit`);
          await this.coupons.createRedemption({ couponId: quote.coupon.id, userId: user.id, orderId: order.id }, tx);
        }

        await this.inventory.reserve(order.id, quote.lines, tx);
        await this.carts.clear(user.id, tx);
        return order;
      }, { timeout: 15000, maxWait: 10000 });
    } catch (err) {
      // Two concurrent requests with the same Idempotency-Key: the unique index
      // (userId, idempotencyKey) lets exactly one insert win; return that order.
      if (err.code === 'P2002' && String(err.meta?.target || '').includes('idempotencyKey')) {
        const winner = await this.orders.findByIdempotencyKey(user.id, idempotencyKey);
        if (winner) return this.replay(winner);
      }
      throw err;
    }

    this.events.publishAll([{ name: 'order.created', payload: { order: created } }]);

    let checkoutUrl = null;
    let paymentError = null;
    try {
      ({ checkoutUrl } = await this.payment.createSession(created, { name: shipping.name, email: user.email }));
    } catch (err) {
      logger.warn('payment session creation failed', { orderId: created.id, code: err.code });
      paymentError = { code: err.code || 'PAYMENT_GATEWAY_UNAVAILABLE', message: 'Your order is saved and stock is held. The payment page could not be opened – retry from your order.' };
    }

    return { replayed: false, order: dto.order(await this.orders.findById(created.id)), checkoutUrl, paymentError };
  }
}

module.exports = CheckoutService;
