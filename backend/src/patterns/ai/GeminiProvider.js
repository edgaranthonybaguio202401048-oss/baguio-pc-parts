'use strict';
const { AiProvider } = require('./AiProvider');

/** Google Gemini – generateContent with JSON mode + response schema. */
class GeminiProvider extends AiProvider {
  constructor({ apiKey, model }, opts) {
    super('gemini', model, opts);
    this.apiKey = apiKey;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  buildRequest({ system, user, schema, maxOutputTokens }) {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      // Key travels in a header, never in the URL (so it never lands in logs).
      headers: { 'x-goog-api-key': this.apiKey },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          maxOutputTokens,
          temperature: 0.3,
        },
      },
    };
  }

  extractText(json) {
    return json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  }
}

module.exports = GeminiProvider;
