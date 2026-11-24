'use strict';
const crypto = require('crypto');

/** Attaches a request ID used in every error envelope and log line. */
module.exports = function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.locals.requestId = id;
  res.set('X-Request-Id', id);
  next();
};
