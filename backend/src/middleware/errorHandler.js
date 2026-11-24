'use strict';
const { Prisma } = require('@prisma/client');
const { AppError } = require('../utils/errors');
const { fail } = require('../utils/response');
const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  return fail(res, 404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`);
}

/**
 * Central error handler (S-11). Known errors map to their status; anything
 * unexpected becomes a generic 500 with the requestId. Stack traces, SQL and
 * file paths go to server logs only – never to the client.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return fail(res, 400, 'MALFORMED_JSON', 'Request body is not valid JSON');
  }
  if (err.type === 'entity.too.large') {
    return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (err.message === 'CORS_ORIGIN_DENIED') {
    return fail(res, 403, 'CORS_ORIGIN_DENIED', 'Origin not allowed');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return fail(res, 409, 'UNIQUE_CONSTRAINT', 'A record with the same unique value already exists');
    if (err.code === 'P2025') return fail(res, 404, 'NOT_FOUND', 'Resource not found');
    if (err.code === 'P2003') return fail(res, 409, 'REFERENCE_CONSTRAINT', 'Record is referenced by other data');
  }
  logger.error('Unhandled error', {
    requestId: res.locals.requestId,
    method: req.method,
    path: req.path,
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  return fail(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}

module.exports = { errorHandler, notFoundHandler };
