import { CHAT_INTENTS } from '@dirtfit/shared';
import { sanitizeAssistantOutput } from '../injection-guard.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Strip Google API key patterns and excessive whitespace from error summaries before logging.
 * @param {string} rawText
 * @returns {string}
 */
function sanitizeErrorSummary(rawText) {
  if (typeof rawText !== 'string') {
    return '';
  }
  return rawText
    .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

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
   * @returns {Promise<{
   *   ok: boolean,
   *   status: number,
   *   text?: string,
   *   retryable?: boolean,
   *   reason?: string,
   *   errorCode?: string|null,
   *   errorSummary?: string,
   *   latencyMs: number,
   * }>}
   */
  async invokeOnce(renderedPrompt) {
    const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(this.model)}:generateContent`;
    const startedAt = Date.now();

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

      const latencyMs = Math.max(1, Date.now() - startedAt);

      if (!response.ok) {
        const rawBody = (await response.text().catch(() => '')).slice(0, 512);
        let errorCode = null;
        let errorSummary = sanitizeErrorSummary(rawBody);
        try {
          const errJson = JSON.parse(rawBody);
          if (typeof errJson?.error?.status === 'string') {
            errorCode = errJson.error.status;
          }
          if (typeof errJson?.error?.message === 'string') {
            errorSummary = sanitizeErrorSummary(errJson.error.message);
          }
        } catch {
          // Non-JSON error body already sanitized above
        }

        return {
          ok: false,
          status: response.status,
          retryable: response.status >= 500,
          reason: `HTTP_${response.status}`,
          errorCode,
          errorSummary,
          latencyMs,
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
          errorCode: 'EMPTY_CANDIDATE',
          errorSummary: 'Gemini returned 200 without usable text parts.',
          latencyMs,
        };
      }

      return {
        ok: true,
        status: response.status,
        text: sanitized,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Math.max(1, Date.now() - startedAt);
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return {
        ok: false,
        status: isTimeout ? 504 : 503,
        retryable: !isTimeout,
        reason: isTimeout ? 'TIMEOUT' : err?.name || 'NETWORK_ERROR',
        errorCode: isTimeout ? 'TIMEOUT' : err?.code || err?.name || 'NETWORK_ERROR',
        errorSummary: sanitizeErrorSummary(err?.message || ''),
        latencyMs,
      };
    }
  }

  /**
   * Generate grounded response via Gemini Free Tier, using deterministic fast-path for GREETING,
   * retrying at most once on transient 5xx, and logging structured secret-free fallback warnings.
   * @param {object} groundedContext
   * @returns {Promise<{ content: string, provider: string, degraded: boolean }>}
   */
  async generate(groundedContext) {
    if (
      groundedContext.intent === CHAT_INTENTS.GREETING ||
      groundedContext.intent === CHAT_INTENTS.OUT_OF_SCOPE
    ) {
      return this.fallbackAdapter.generate(groundedContext);
    }

    const totalStartedAt = Date.now();
    let attempts = 1;
    let attemptResult = await this.invokeOnce(groundedContext.renderedPrompt);

    if (!attemptResult.ok && attemptResult.retryable) {
      attempts = 2;
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
          event: 'chatbot_gemini_fallback',
          model: this.model,
          intent: groundedContext.intent,
          locale: groundedContext.locale,
          statusCode: attemptResult.status,
          errorCode: attemptResult.errorCode ?? null,
          reason: attemptResult.reason,
          errorSummary: attemptResult.errorSummary || null,
          attempts,
          latencyMs: Math.max(1, Date.now() - totalStartedAt),
        },
        'Gemini chat request failed; fell back to GroundedFallbackAdapter'
      );
    }

    const fallback = await this.fallbackAdapter.generate(groundedContext);
    return {
      ...fallback,
      degraded: true,
    };
  }
}
