'use strict';
const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');
const { pesosToCents, centsToPesos } = require('../../utils/money');
const { AppError } = require('../../utils/errors');

/**
 * Maya Checkout (sandbox: https://pg-sandbox.paymaya.com).
 *
 * Webhook authenticity – IMPORTANT for the defense:
 * Maya Checkout does NOT sign webhook payloads with an HMAC header. Maya's
 * documented security control is to accept webhooks only from Maya's
 * published IP addresses. We therefore verify each webhook with THREE layers:
 *   1. a long random shared secret embedded in the registered webhook URL,
 *      compared in constant time (crypto.timingSafeEqual);
 *   2. the source IP must be in MAYA_WEBHOOK_ALLOWED_IPS (Maya's list);
 *   3. the webhook body is NEVER trusted – we re-fetch the payment from
 *      Maya's API with our secret key and verify status, amount and currency
 *      before changing any order (see PaymentService.reconcilePayment).
 * Failing 1 or 2 returns 401 and the order is untouched.
 */
const STATUS_MAP = Object.freeze({
  PAYMENT_SUCCESS: 'paid',
  CHECKOUT_SUCCESS: 'paid', // legacy event name
  PAYMENT_FAILED: 'failed',
  CHECKOUT_FAILURE: 'failed',
  CHECKOUT_FAILED: 'failed',
  PAYMENT_EXPIRED: 'expired',
  PAYMENT_CANCELLED: 'cancelled',
  CHECKOUT_CANCELLED: 'cancelled',
  CHECKOUT_DROPOUT: 'cancelled',
  VOIDED: 'cancelled',
  REFUNDED: 'cancelled',
});

class MayaProvider extends PaymentProvider {
  constructor(cfg, opts) {
    super('maya', opts);
    this.cfg = cfg;
  }

  basicAuth(key) {
    return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
  }

  async createCheckout({ order, items, requestReference, redirectUrls, buyer }) {
    this.ensureConfigured(this.cfg.publicKey);
    const [firstName, ...rest] = (buyer.name || 'Customer').split(' ');
    const body = {
      totalAmount: {
        value: centsToPesos(order.totalCents),
        currency: order.currency,
        details: {
          subtotal: centsToPesos(order.subtotalCents),
          discount: centsToPesos(order.discountCents),
          shippingFee: centsToPesos(order.shippingFeeCents),
        },
      },
      buyer: {
        firstName,
        lastName: rest.join(' ') || '-',
        contact: { phone: order.shipPhone, email: buyer.email },
        shippingAddress: {
          line1: order.shipAddressLine,
          city: order.shipCity,
          state: order.shipProvince,
          zipCode: order.shipPostalCode,
          countryCode: 'PH',
        },
      },
      items: items.map((i) => ({
        name: i.productName,
        code: i.sku,
        quantity: i.quantity,
        amount: { value: centsToPesos(i.unitPriceCents) },
        totalAmount: { value: centsToPesos(i.lineTotalCents) },
      })),
      redirectUrl: redirectUrls,
      requestReferenceNumber: requestReference,
      metadata: { orderNumber: order.orderNumber },
    };
    const json = await this.httpJson(`${this.cfg.baseUrl}/checkout/v1/checkouts`, {
      method: 'POST',
      headers: { Authorization: this.basicAuth(this.cfg.publicKey) },
      body,
    });
    if (!json || !json.checkoutId || !json.redirectUrl) {
      throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', 'Maya returned an unexpected checkout response');
    }
    return { gatewayRef: json.checkoutId, checkoutUrl: json.redirectUrl };
  }

  verifyWebhook({ query, ip }) {
    const expected = this.cfg.webhookToken;
    if (!expected) throw this.webhookRejected('MAYA_WEBHOOK_TOKEN not configured');
    const supplied = typeof query?.token === 'string' ? query.token : '';
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw this.webhookRejected('invalid webhook token');
    }
    const allowed = this.cfg.allowedIps;
    if (allowed.length) {
      const clean = String(ip || '').replace(/^::ffff:/, '');
      if (!allowed.includes(clean)) throw this.webhookRejected(`source IP ${clean} not allowed`);
    }
    return true;
  }

  parseWebhookEvent(rawBody) {
    let body;
    try { body = JSON.parse(rawBody.toString('utf8')); } catch { body = null; }
    if (!body || typeof body !== 'object') {
      return { eventId: `invalid:${crypto.createHash('sha256').update(rawBody).digest('hex')}`, type: 'INVALID_JSON', gatewayRef: null, requestReference: null, actionable: false };
    }
    const type = String(body.status || body.paymentStatus || body.name || 'UNKNOWN').toUpperCase();
    const gatewayRef = body.id ? String(body.id) : null;
    return {
      // Maya has no separate event id: payment id + status uniquely identifies the transition.
      eventId: `${gatewayRef || 'none'}:${type}`,
      type,
      gatewayRef,
      requestReference: body.requestReferenceNumber ? String(body.requestReferenceNumber) : null,
      actionable: Boolean(STATUS_MAP[type]) && Boolean(gatewayRef || body.requestReferenceNumber),
    };
  }

  async retrievePayment(gatewayRef) {
    this.ensureConfigured(this.cfg.secretKey);
    let json;
    try {
      json = await this.httpJson(`${this.cfg.baseUrl}/payments/v1/payments/${encodeURIComponent(gatewayRef)}`, {
        headers: { Authorization: this.basicAuth(this.cfg.secretKey) },
      });
    } catch (err) {
      // 404 = customer has not attempted payment yet on this checkout
      if (err.httpStatus === 404) return this.normalizedResult('pending', null, null, 'NOT_FOUND');
      throw err;
    }
    const gatewayStatus = String(json.status || json.paymentStatus || '').toUpperCase();
    const status = STATUS_MAP[gatewayStatus] || (json.isPaid === true ? 'paid' : 'pending');
    const amountCents = json.amount !== undefined ? pesosToCents(json.amount) : null;
    return this.normalizedResult(status, amountCents, json.currency || null, gatewayStatus);
  }
}

module.exports = MayaProvider;
