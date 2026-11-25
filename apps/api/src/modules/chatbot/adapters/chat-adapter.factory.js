import { GroundedFallbackAdapter } from './fallback.adapter.js';
import { GeminiChatAdapter } from './gemini.adapter.js';

/**
 * Select active Chatbot LLM provider strategy from runtime configuration.
 * Defaults gracefully to GroundedFallbackAdapter whenever `GEMINI_API_KEY` is absent or `CHAT_PROVIDER=fallback`.
 * @param {object} env
 * @param {object} [logger]
 * @returns {{ generate: (ctx: object) => Promise<{ content: string, provider: string, degraded: boolean }> }}
 */
export function resolveChatAdapter(env, logger = null) {
  const fallbackAdapter = new GroundedFallbackAdapter();
  const providerMode = env?.CHAT_PROVIDER ?? 'auto';
  const apiKey = typeof env?.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY.trim() : '';

  if (providerMode === 'fallback' || apiKey.length === 0) {
    return fallbackAdapter;
  }

  return new GeminiChatAdapter({
    apiKey,
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
    timeoutMs: env.CHAT_TIMEOUT_MS ?? 12_000,
    fallbackAdapter,
    logger,
  });
}
