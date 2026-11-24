'use strict';
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { fail } = require('../utils/response');

const handler = (code, message) => (req, res) => fail(res, 429, code, message);

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true',
};

/** S-10: brute-force protection on register/login. */
const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  handler: handler('RATE_LIMITED', 'Too many authentication attempts. Try again later.'),
});

/** L4-08: AI cost control – per signed-in user, falling back to IP. */
const aiLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: config.ai.rateLimitPer15Min,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${req.ip}`),
  handler: handler('AI_RATE_LIMITED', 'AI assistant limit reached. Please try again in a few minutes.'),
});

/** General API ceiling. */
const apiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 300,
  handler: handler('RATE_LIMITED', 'Too many requests'),
});

module.exports = { authLimiter, aiLimiter, apiLimiter };
