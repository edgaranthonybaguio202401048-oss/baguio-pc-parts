'use strict';
const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');

/**
 * PayMongo Checkout Sessions (test mode). Second concrete subclass of
 * PaymentProvider – selected with PAYMENT_PROVIDER=paymongo.
 * Unlike Maya, PayMongo signs webhooks: header
 *   Paymongo-Signature: t=<timestamp>,te=<test sig>,li=<live sig>
 * where sig = HMAC-SHA256(webhookSecret, `${t}.${rawBody}`).
 */
class PayMongoProvider extends PaymentProvider {
  constructor(cfg, opts) {
    super('paymongo', opts);
    this.cfg = cfg;
    this.baseUrl = 'https://api.paymongo.com/v1';
  }

  auth() {
    return `Basic ${Buffer.from(`${this.cfg.secretKey}:`).toString('base64')}`;
  }

  async createCheckout({ order, requestReference, redirectUrls }) {
    this.ensureConfigured(this.cfg.secretKey);
    // PayMongo computes the total from line items, so the server-calculated
    // order total (after discount + shipping) is sent as ONE line item.
    const body = {
      data: {
        attributes: {
          line_items: [{ name: `Baguio PC Parts order ${order.orderNumber}`, quantity: 1, amount: order.totalCents, currency: order.currency }],
          payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
          success_url: redirectUrls.success,
          cancel_url: redirectUrls.cancel,
          reference_number: requestReference,
          description: `Order ${order.orderNumber}`,
          send_email_receipt: false,
          show_line_items: true,
        },
      },
    };
    const json = await this.httpJson(`${this.baseUrl}/checkout_sessions`, {
      method: 'POST', headers: { Authorization: this.auth() }, body,
    });
    return { gatewayRef: json.data.id, checkoutUrl: json.data.attributes.checkout_url };
  }

  verifyWebhook({ rawBody, headers }) {
    const secret = this.cfg.webhookSecret;
    if (!secret) throw this.webhookRejected('PAYMONGO_WEBHOOK_SECRET not configured');
    const header = headers['paymongo-signature'];
    if (!header) throw this.webhookRejected('missing Paymongo-Signature');
    const parts = Object.fromEntries(String(header).split(',').map((kv) => kv.split('=').map((s) => s.trim())));
    if (!parts.t) throw this.webhookRejected('malformed signature header');
    let livemode = false;
    try { livemode = JSON.parse(rawBody.toString('utf8'))?.data?.attributes?.livemode === true; } catch { /* handled below */ }
    const provided = livemode ? parts.li : parts.te;
    if (!provided) throw this.webhookRejected('signature for mode missing');
    const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody.toString('utf8')}`).digest('hex');
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw this.webhookRejected('signature mismatch');
    return true;
  }

  parseWebhookEvent(rawBody) {
    const body = JSON.parse(rawBody.toString('utf8'));
    const type = body?.data?.attributes?.type || 'unknown';
    const resource = body?.data?.attributes?.data;
    const isCheckout = type.startsWith('checkout_session.');
    return {
      eventId: String(body?.data?.id || ''),
      type,
      gatewayRef: isCheckout ? resource?.id || null : null,
      requestReference: resource?.attributes?.reference_number || null,
      actionable: type === 'checkout_session.payment.paid',
    };
  }

  async retrievePayment(gatewayRef) {
    this.ensureConfigured(this.cfg.secretKey);
    const json = await this.httpJson(`${this.baseUrl}/checkout_sessions/${encodeURIComponent(gatewayRef)}`, {
      headers: { Authorization: this.auth() },
    });
    const attrs = json.data.attributes;
    const paid = (attrs.payments || []).find((p) => p.attributes?.status === 'paid');
    if (paid) return this.normalizedResult('paid', paid.attributes.amount, String(paid.attributes.currency || '').toUpperCase(), 'paid');
    if (attrs.status === 'expired') return this.normalizedResult('expired', null, null, 'expired');
    return this.normalizedResult('pending', null, null, attrs.status);
  }
}

module.exports = PayMongoProvider;
