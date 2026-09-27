class LLMProviders {
  static async generatePlanOrAction(prompt, config = {}) {
    const provider = (config.provider || 'builtin').toLowerCase();
    const apiKey = config.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`] || '';
    const model = config.model || '';

    if (provider === 'builtin' || !apiKey && provider !== 'ollama') {
      return null; // Will fallback to built-in autonomous heuristic planner
    }

    try {
      if (provider === 'gemini') {
        return await this.callGemini(prompt, apiKey, model || 'gemini-1.5-flash');
      } else if (provider === 'openai') {
        return await this.callOpenAI(prompt, apiKey, model || 'gpt-4o-mini');
      } else if (provider === 'anthropic') {
        return await this.callAnthropic(prompt, apiKey, model || 'claude-3-5-sonnet-20241022');
      } else if (provider === 'groq') {
        return await this.callGroq(prompt, apiKey, model || 'llama-3.3-70b-versatile');
      } else if (provider === 'ollama') {
        return await this.callOllama(prompt, config.endpoint || 'http://localhost:11434', model || 'llama3');
      }
    } catch (err) {
      console.warn(`[LLMProvider] ${provider} error, falling back to built-in planner:`, err.message);
      return null;
    }

    return null;
  }

  static async callGemini(prompt, apiKey, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1500
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this.parseJSONResponse(text);
  }

  static async callOpenAI(prompt, apiKey, model) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(text);
  }

  static async callGroq(prompt, apiKey, model) {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(text);
  }

  static async callAnthropic(prompt, apiKey, model) {
    const url = 'https://api.anthropic.com/v1/messages';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return this.parseJSONResponse(text);
  }

  static async callOllama(prompt, endpoint, model) {
    const url = `${endpoint.replace(/\/$/, '')}/api/generate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        format: 'json',
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return this.parseJSONResponse(data.response);
  }

  static parseJSONResponse(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e2) {}
      }
      return null;
    }
  }
}

module.exports = LLMProviders;
