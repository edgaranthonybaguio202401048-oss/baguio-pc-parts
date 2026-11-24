'use strict';
/**
 * T-04: one response envelope for the whole API.
 *   success: { success: true, data, meta? }
 *   error:   { success: false, error: { code, message, details? }, requestId }
 */

function ok(res, data, meta, status = 200) {
  const body = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

const created = (res, data, meta) => ok(res, data, meta, 201);
const noContent = (res) => res.status(204).end();

function fail(res, status, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ success: false, error, requestId: res.locals.requestId });
}

function pageMeta(total, page, limit) {
  return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { ok, created, noContent, fail, pageMeta };
