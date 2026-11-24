'use strict';

class AiProviderError extends Error {
  constructor(reason, message) {
    super(message || reason);
    this.name = 'AiProviderError';
    this.reason = reason; // 'timeout' | 'rate_limited' | 'provider_error' | 'invalid_json' | 'not_configured'
  }
}

/**
 * ABSTRACT BASE CLASS for AI providers (second abstract hierarchy).
 * TEMPLATE METHOD: generateJson() is implemented once here – send request,
 * map HTTP failures, parse JSON – and calls two abstract hooks that each
 * provider must supply:
 *   buildRequest({ system, user, schema, maxOutputTokens }) -> { url, headers, body }
 *   extractText(responseJson) -> string (the model's raw JSON text)
 */
class AiProvider {
  constructor(name, model, { fetchImpl } = {}) {
    if (new.target === AiProvider) throw new TypeError('AiProvider is abstract and cannot be instantiated directly');
    this.name = name;
    this.model = model;
    this.fetchImpl = fetchImpl || ((...a) => globalThis.fetch(...a));
  }

  // eslint-disable-next-line no-unused-vars
  buildRequest(_input) {
    throw new Error(`${this.constructor.name} must implement buildRequest()`);
  }

  // eslint-disable-next-line no-unused-vars
  extractText(_json) {
    throw new Error(`${this.constructor.name} must implement extractText()`);
  }

  isConfigured() {
    return true;
  }

  async generateJson(input, { signal } = {}) {
    if (!this.isConfigured()) throw new AiProviderError('not_configured', `${this.name} API key missing`);
    const { url, headers, body } = this.buildRequest(input);
    let res;
    try {
      res = await this.fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
    } catch (err) {
      throw new AiProviderError(err.name === 'AbortError' ? 'timeout' : 'provider_error', 'AI provider unreachable');
    }
    if (res.status === 429) throw new AiProviderError('rate_limited', 'AI provider rate limit');
    if (!res.ok) throw new AiProviderError('provider_error', `AI provider HTTP ${res.status}`);
    let json;
    try { json = await res.json(); } catch { throw new AiProviderError('invalid_json', 'AI provider response was not JSON'); }
    const text = this.extractText(json);
    if (!text) throw new AiProviderError('invalid_json', 'AI provider returned no content');
    try {
      return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      throw new AiProviderError('invalid_json', 'Model output was not valid JSON');
    }
  }
}

module.exports = { AiProvider, AiProviderError };
