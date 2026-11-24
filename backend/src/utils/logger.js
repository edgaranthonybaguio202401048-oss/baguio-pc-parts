'use strict';
/**
 * Minimal structured JSON logger. Never pass secrets, tokens, passwords or
 * full webhook query strings into it – redact() strips common sensitive keys
 * as a second line of defence.
 */
const SENSITIVE = /pass(word)?|token|secret|authorization|api[-_]?key|signature/i;

function redact(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

function write(level, msg, meta) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = { level, time: new Date().toISOString(), msg, ...redact(meta || {}) };
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}

module.exports = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
  redact,
};
