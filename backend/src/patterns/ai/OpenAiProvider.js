'use strict';
const { AiProvider } = require('./AiProvider');

/** OpenAI Chat Completions in JSON mode – alternative provider (AI_PROVIDER=openai). */
class OpenAiProvider extends AiProvider {
  constructor({ apiKey, model }, opts) {
    super('openai', model, opts);
    this.apiKey = apiKey;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  buildRequest({ system, user, schema, maxOutputTokens }) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: {
        model: this.model,
        temperature: 0.3,
        max_tokens: maxOutputTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${system}\n\nReturn ONLY a JSON object matching this JSON schema:\n${JSON.stringify(schema)}` },
          { role: 'user', content: user },
        ],
      },
    };
  }

  extractText(json) {
    return json?.choices?.[0]?.message?.content || '';
  }
}

module.exports = OpenAiProvider;
