import { sanitizeAssistantOutput } from '../injection-guard.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Google Gemini API Adapter using native Node 22 `fetch()` (0 SDK bloat).
 * Sends the API key strictly via `x-goog-api-key` header and falls back automatically on errors/429/timeout.
 */
export class GeminiChatAdapter {
  /**
   * @param {object} options
   * @param {string} options.apiKey
   * @param {string} [options.model]
   * @param {number} [options.timeoutMs]
   * @param {import('./fallback.adapter.js').GroundedFallbackAdapter} options.fallbackAdapter
   * @param {typeof fetch} [options.fetchImpl]
   * @param {object} [options.logger]
   */
  constructor({
    apiKey,
    model = 'gemini-2.5-flash',
    timeoutMs = 12_000,
    fallbackAdapter,
    fetchImpl = fetch,
    logger = null,
  }) {
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fallbackAdapter = fallbackAdapter;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  /**
   * Invoke Gemini generateContent once cleanly with AbortSignal.timeout and header-only key.
   * @param {{ systemInstruction: string, userPrompt: string }} renderedPrompt
   * @returns {Promise<{ ok: boolean, status: number, text?: string, retryable?: boolean, reason?: string }>}
   */
  async invokeOnce(renderedPrompt) {
    const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(this.model)}:generateContent`;

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: renderedPrompt.systemInstruction }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: renderedPrompt.userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 700,
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          retryable: response.status >= 500,
          reason: `HTTP_${response.status}`,
        };
      }

      const payload = await response.json();
      const rawText = payload?.candidates?.[0]?.content?.parts
        ?.map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();

      const sanitized = sanitizeAssistantOutput(rawText ?? '');
      if (!sanitized) {
        return {
          ok: false,
          status: 502,
          retryable: false,
          reason: 'EMPTY_GEMINI_CANDIDATE',
        };
      }

      return {
        ok: true,
        status: response.status,
        text: sanitized,
      };
    } catch (err) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return {
        ok: false,
        status: isTimeout ? 504 : 503,
        retryable: !isTimeout,
        reason: isTimeout ? 'TIMEOUT' : err?.name || 'NETWORK_ERROR',
      };
    }
  }

  /**
   * Generate grounded response via Gemini Free Tier, retrying at most once on transient 5xx,
   * and gracefully degrading to `GroundedFallbackAdapter` on 429/timeout/errors.
   * @param {object} groundedContext
   * @returns {Promise<{ content: string, provider: string, degraded: boolean }>}
   */
  async generate(groundedContext) {
    let attemptResult = await this.invokeOnce(groundedContext.renderedPrompt);

    if (!attemptResult.ok && attemptResult.retryable) {
      attemptResult = await this.invokeOnce(groundedContext.renderedPrompt);
    }

    if (attemptResult.ok) {
      return {
        content: attemptResult.text,
        provider: 'gemini',
        degraded: false,
      };
    }

    if (this.logger?.warn) {
      this.logger.warn(
        {
          reason: attemptResult.reason,
          status: attemptResult.status,
          model: this.model,
        },
        'Gemini chat request fell back to GroundedFallbackAdapter'
      );
    }

    const fallback = await this.fallbackAdapter.generate(groundedContext);
    return {
      ...fallback,
      degraded: true,
    };
  }
}
