'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { Errors } = require('../utils/errors');

/**
 * authenticate – requires a valid, unexpired Bearer JWT (S-02).
 * Tampered, expired or missing tokens -> 401. There is no weaker fallback path.
 */
function authenticate(req, _res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(Errors.unauthorized('AUTH_REQUIRED', 'Authentication required'));
  }
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
    req.user = Object.freeze({ id: payload.sub, role: payload.role, email: payload.email });
    return next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    return next(Errors.unauthorized(code, 'Invalid or expired token'));
  }
}

/**
 * authorize – role check on the SERVER (L1-02, S-03). Returns a middleware,
 * so it can be composed per-router: router.use(authenticate, authorize('admin')).
 */
function authorize(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.user) return next(Errors.unauthorized('AUTH_REQUIRED', 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(Errors.forbidden());
    return next();
  };
}

/** Like authenticate, but anonymous requests are allowed through. */
function optionalAuth(req, res, next) {
  if (!req.get('Authorization')) return next();
  return authenticate(req, res, next);
}

module.exports = { authenticate, authorize, optionalAuth };
