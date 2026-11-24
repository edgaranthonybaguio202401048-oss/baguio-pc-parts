'use strict';

/**
 * Domain error carrying an HTTP status and a stable machine-readable code.
 * Services throw these; the central error handler turns them into the
 * standard error envelope. Services never touch `res`.
 */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const Errors = {
  badRequest: (code, msg, details) => new AppError(400, code || 'BAD_REQUEST', msg || 'Malformed request', details),
  unauthorized: (code, msg) => new AppError(401, code || 'UNAUTHORIZED', msg || 'Authentication required'),
  forbidden: (msg) => new AppError(403, 'FORBIDDEN', msg || 'You do not have permission to perform this action'),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`),
  conflict: (code, msg, details) => new AppError(409, code || 'CONFLICT', msg, details),
  validation: (code, msg, details) => new AppError(422, code || 'VALIDATION_ERROR', msg || 'Invalid input', details),
  tooMany: (code, msg) => new AppError(429, code || 'RATE_LIMITED', msg || 'Too many requests'),
  unavailable: (code, msg, details) => new AppError(503, code || 'SERVICE_UNAVAILABLE', msg, details),
};

module.exports = { AppError, Errors };
