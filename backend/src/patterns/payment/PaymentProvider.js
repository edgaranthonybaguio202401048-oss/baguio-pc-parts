'use strict';
const { AppError } = require('../../utils/errors');

/**
 * ABSTRACT BASE CLASS (T-16) – the contract every payment gateway adapter
 * must fulfil. It cannot be instantiated directly, and every abstract
 * operation throws a clear error if a subclass forgets to implement it.
 *
 * Shared, inherited behaviour (why inheritance fits here – T-20):
 *  - httpJson(): one place for timeouts, JSON parsing and error mapping
 *  - ensureConfigured(): uniform "missing key" handling
 *  - normalizedResult(): one shape for every provider's payment status
 * Subclasses only specialise what genuinely differs between gateways.
 *
 * Normalised payment result returned by retrievePayment():
 *   { status: 'paid'|'pending'|'failed'|'cancelled'|'expired',
 *     amountCents: number|null, currency: string|null, gatewayStatus: string }
 */
class PaymentProvider {
  constructor(name, { timeoutMs = 10000, fetchImpl } = {}) {
    if (new.target === PaymentProvider) {
      throw new TypeError('PaymentProvider is abstract and cannot be instantiated directly');
    }
    this.name = name;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
  }

  // ------------------------------------------------------------- abstract operations

  /** @returns {Promise<{ gatewayRef: string, checkoutUrl: string }>} */
  // eslint-disable-next-line no-unused-vars
  async createCheckout(_input) {
    throw new Error(`${this.constructor.name} must implement createCheckout()`);
  }

  /** Throws AppError(401) when the request did not come from the gateway. */
  // eslint-disable-next-line no-unused-vars
  verifyWebhook(_request) {
    throw new Error(`${this.constructor.name} must implement verifyWebhook()`);
  }

  /** @returns {{ eventId: string, type: string, gatewayRef: string|null, requestReference: string|null, actionable: boolean }} */
  // eslint-disable-next-line no-unused-vars
  parseWebhookEvent(_rawBody) {
    throw new Error(`${this.constructor.name} must implement parseWebhookEvent()`);
  }

  /** Authoritative status straight from the gateway API (never from the webhook body). */
  // eslint-disable-next-line no-unused-vars
  async retrievePayment(_gatewayRef) {
    throw new Error(`${this.constructor.name} must implement retrievePayment()`);
  }

  // ------------------------------------------------------------- shared behaviour

  ensureConfigured(...values) {
    if (values.some((v) => !v)) {
      throw new AppError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED', `${this.name} keys are not configured on the server`);
    }
  }

  webhookRejected(reason) {
    const err = new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook verification failed');
    err.reason = reason; // logged server-side only
    return err;
  }

  async httpJson(url, { method = 'GET', headers = {}, body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw new AppError(502, 'PAYMENT_GATEWAY_UNAVAILABLE', `${this.name} could not be reached`, { cause: err.name });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const err = new AppError(502, 'PAYMENT_GATEWAY_ERROR', `${this.name} returned HTTP ${res.status}`);
      err.httpStatus = res.status;
      throw err;
    }
    return json;
  }

  normalizedResult(status, amountCents, currency, gatewayStatus) {
    return { status, amountCents: amountCents ?? null, currency: currency ?? null, gatewayStatus: String(gatewayStatus || '') };
  }
}

module.exports = PaymentProvider;
