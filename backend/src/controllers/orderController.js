'use strict';
const wrapAll = require('./_wrap');
const { checkoutService, orderService, paymentService } = require('../services');
const { idempotencyHeader } = require('../validators/schemas');
const { ok, created } = require('../utils/response');
const { Errors } = require('../utils/errors');

module.exports = wrapAll({
  async preview(req, res) {
    ok(res, await checkoutService.preview(req.user, req.body));
  },

  /** POST /orders – checkout. Requires an Idempotency-Key header (L2-08). */
  async checkout(req, res) {
    const key = idempotencyHeader.safeParse(req.get('Idempotency-Key') || '');
    if (!key.success) {
      throw Errors.validation('IDEMPOTENCY_KEY_REQUIRED', 'Send a unique Idempotency-Key header (8–100 chars) per checkout attempt', [
        { location: 'headers', field: 'Idempotency-Key', message: 'required, 8–100 characters [A-Za-z0-9_-]' },
      ]);
    }
    const result = await checkoutService.checkout(req.user, req.body, key.data);
    res.set('Idempotent-Replayed', String(result.replayed));
    const data = { order: result.order, checkoutUrl: result.checkoutUrl, paymentError: result.paymentError };
    return result.replayed ? ok(res, data) : created(res, data);
  },

  async listMine(req, res) {
    const { items, meta } = await orderService.listMine(req.user.id, req.validatedQuery);
    ok(res, items, meta);
  },
  async getMine(req, res) {
    ok(res, await orderService.getMine(req.user.id, req.params.id));
  },
  async cancel(req, res) {
    ok(res, await orderService.cancelMine(req.user, req.params.id));
  },
  async retryPayment(req, res) {
    created(res, await paymentService.retrySession(req.user, req.params.id));
  },
  async verifyPayment(req, res) {
    ok(res, await paymentService.verifyOnReturn(req.user, req.params.id));
  },
});
