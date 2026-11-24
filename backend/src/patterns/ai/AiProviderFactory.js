'use strict';
const config = require('../../config');
const GeminiProvider = require('./GeminiProvider');
const OpenAiProvider = require('./OpenAiProvider');
const AiProviderProxy = require('./AiProviderProxy');

/**
 * FACTORY METHOD: returns the configured AI provider already wrapped in its
 * Proxy. Callers depend only on the generateJson() interface.
 */
const registry = {
  gemini: () => new GeminiProvider(config.ai.gemini),
  openai: () => new OpenAiProvider(config.ai.openai),
};

let instance = null;

function getAiProvider() {
  if (!instance) {
    const make = registry[config.ai.provider];
    instance = new AiProviderProxy(make(), { timeoutMs: config.ai.timeoutMs, cacheTtlSeconds: config.ai.cacheTtlSeconds });
  }
  return instance;
}

function resetAiProvider() {
  instance = null;
}

module.exports = { getAiProvider, resetAiProvider };
