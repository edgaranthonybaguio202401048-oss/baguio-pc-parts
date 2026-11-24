'use strict';
/**
 * SINGLETON (configuration).
 * Environment variables are read, validated and frozen exactly once when this
 * module is first required. Node's module cache guarantees every `require`
 * receives the same frozen object, so no code can mutate config at runtime.
 */
require('dotenv').config();
const { z } = require('zod');

const csv = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  PAYMENT_PROVIDER: z.enum(['maya', 'paymongo']).default('maya'),
  PAYMENT_CURRENCY: z.string().default('PHP'),
  RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  MAYA_BASE_URL: z.string().default('https://pg-sandbox.paymaya.com'),
  MAYA_PUBLIC_KEY: z.string().default(''),
  MAYA_SECRET_KEY: z.string().default(''),
  MAYA_WEBHOOK_TOKEN: z.string().default(''),
  MAYA_WEBHOOK_ALLOWED_IPS: z.string().default(''),
  PAYMONGO_SECRET_KEY: z.string().default(''),
  PAYMONGO_WEBHOOK_SECRET: z.string().default(''),
  AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(500),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(800),
  AI_RATE_LIMIT_PER_15_MIN: z.coerce.number().int().positive().default(20),
  AI_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(300),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print only variable NAMES, never values.
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:\n - ' + problems.join('\n - '));
  process.exit(1);
}

const e = parsed.data;

const config = Object.freeze({
  env: e.NODE_ENV,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  port: e.PORT,
  corsOrigins: Object.freeze(csv(e.CORS_ORIGINS)),
  frontendUrl: e.FRONTEND_URL.replace(/\/$/, ''),
  apiPublicUrl: e.API_PUBLIC_URL.replace(/\/$/, ''),
  auth: Object.freeze({
    jwtSecret: e.JWT_SECRET,
    jwtExpiresIn: e.JWT_EXPIRES_IN,
    bcryptRounds: e.BCRYPT_ROUNDS,
  }),
  payment: Object.freeze({
    provider: e.PAYMENT_PROVIDER,
    currency: e.PAYMENT_CURRENCY,
    reservationTtlMinutes: e.RESERVATION_TTL_MINUTES,
    maya: Object.freeze({
      baseUrl: e.MAYA_BASE_URL.replace(/\/$/, ''),
      publicKey: e.MAYA_PUBLIC_KEY,
      secretKey: e.MAYA_SECRET_KEY,
      webhookToken: e.MAYA_WEBHOOK_TOKEN,
      allowedIps: Object.freeze(csv(e.MAYA_WEBHOOK_ALLOWED_IPS)),
    }),
    paymongo: Object.freeze({
      secretKey: e.PAYMONGO_SECRET_KEY,
      webhookSecret: e.PAYMONGO_WEBHOOK_SECRET,
    }),
  }),
  ai: Object.freeze({
    provider: e.AI_PROVIDER,
    gemini: Object.freeze({ apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL }),
    openai: Object.freeze({ apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL }),
    timeoutMs: e.AI_TIMEOUT_MS,
    maxInputChars: e.AI_MAX_INPUT_CHARS,
    maxOutputTokens: e.AI_MAX_OUTPUT_TOKENS,
    rateLimitPer15Min: e.AI_RATE_LIMIT_PER_15_MIN,
    cacheTtlSeconds: e.AI_CACHE_TTL_SECONDS,
  }),
});

module.exports = config;
