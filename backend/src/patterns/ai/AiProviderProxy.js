'use strict';
const crypto = require('crypto');
const logger = require('../../utils/logger');
const { AiProviderError } = require('./AiProvider');

/**
 * PROXY (structural).
 * Exposes the SAME interface as a real AiProvider – generateJson(input) –
 * and sits in the real request path (AiAdvisorService only ever talks to
 * the proxy). It adds, without touching the provider classes:
 *   - a hard timeout (AbortController)             L4-06 / L4-08
 *   - a short-lived response cache (identical prompts cost nothing)  L4-08
 *   - privacy-safe usage logging: provider, latency, outcome – never the
 *     prompt text or the key                        L4-09
 */
class AiProviderProxy {
  constructor(realProvider, { timeoutMs, cacheTtlSeconds, maxEntries = 200 }) {
    this.real = realProvider;
    this.timeoutMs = timeoutMs;
    this.ttlMs = cacheTtlSeconds * 1000;
    this.maxEntries = maxEntries;
    this.cache = new Map();
  }

  get name() { return this.real.name; }
  get model() { return this.real.model; }

  keyFor(input) {
    return crypto.createHash('sha256').update(JSON.stringify([this.real.name, this.real.model, input.system, input.user])).digest('hex');
  }

  async generateJson(input) {
    const key = this.keyFor(input);
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) {
      logger.info('ai.call', { provider: this.name, outcome: 'cache_hit' });
      return structuredClone(hit.value);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    try {
      const value = await this.real.generateJson(input, { signal: controller.signal });
      if (this.ttlMs > 0) {
        if (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
      }
      logger.info('ai.call', { provider: this.name, model: this.model, outcome: 'ok', ms: Date.now() - started });
      return structuredClone(value);
    } catch (err) {
      const reason = err instanceof AiProviderError ? err.reason : 'provider_error';
      logger.warn('ai.call', { provider: this.name, model: this.model, outcome: reason, ms: Date.now() - started });
      throw err instanceof AiProviderError ? err : new AiProviderError(reason, 'AI provider failure');
    } finally {
      clearTimeout(timer);
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = AiProviderProxy;
