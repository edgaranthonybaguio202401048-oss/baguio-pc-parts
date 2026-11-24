'use strict';
const wrapAll = require('./_wrap');
const { paymentService } = require('../services');
const { ok } = require('../utils/response');

/**
 * Webhook receivers. req.body is the RAW Buffer (express.raw on this router),
 * which is required for signature verification. Responds 2xx quickly;
 * duplicates and unknown events are acknowledged and ignored safely.
 */
const handle = (provider) => async (req, res) => {
  const result = await paymentService.handleWebhook(provider, {
    rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.from(''),
    headers: req.headers,
    query: req.query,
    ip: req.ip,
  });
  ok(res, result);
};

module.exports = wrapAll({
  maya: handle('maya'),
  paymongo: handle('paymongo'),
});
