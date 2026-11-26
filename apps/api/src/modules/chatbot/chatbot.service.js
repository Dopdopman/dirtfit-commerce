import { AppError, CHAT_INTENTS, CHAT_ROLES, ERROR_CODES } from '@dirtfit/shared';
import { resolveChatAdapter } from './adapters/chat-adapter.factory.js';
import { buildGroundedChatContext } from './context-builder.js';
import {
  buildGuardrailRefusalMessage,
  detectPromptInjection,
  sanitizeChatInput,
} from './injection-guard.js';
import { resolveEffectiveLocale } from './intent-router.js';
import { linkifyGroundedProducts } from './link-grounder.js';
import {
  createChatSession,
  deleteOwnedChatSessions,
  findActiveSessionByOwner,
  findChatMessageWithSession,
  getAnonymizedChatMetrics,
  listSessionMessages,
  persistChatTurn,
  updateChatMessageFeedback,
} from './chatbot.repository.js';

function computeSessionExpiry(env, isAuthenticated) {
  const ttlDays = isAuthenticated ? 90 : (env?.CHAT_GUEST_SESSION_TTL_DAYS ?? 7);
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

function isSessionOwner(session, owner) {
  if (!session || !owner) {
    return false;
  }
  if (owner.userId && session.userId === owner.userId) {
    return true;
  }
  if (!owner.userId && owner.guestTokenHash && session.guestTokenHash === owner.guestTokenHash) {
    return true;
  }
  return false;
}

/**
 * Retrieve or lazily create the caller's ChatSession and return its recent messages.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ userId: string|null, guestTokenHash: string|null }} owner
 * @param {{ locale?: 'en'|'vi', limit?: number }} [query]
 * @returns {Promise<{ session: object, messages: Array<object> }>}
 */
export async function getOrInitChatSession(app, owner, { locale = 'en', limit = 50 } = {}) {
  const now = new Date();
  let session = await findActiveSessionByOwner(app.prisma, { ...owner, now });

  if (!session) {
    session = await createChatSession(app.prisma, {
      userId: owner.userId,
      guestTokenHash: owner.guestTokenHash,
      locale,
      expiresAt: computeSessionExpiry(app.env, Boolean(owner.userId)),
    });
  }

  const messages = await listSessionMessages(app.prisma, session.id, limit);

  return {
    session: {
      id: session.id,
      locale: session.locale,
      lastActiveAt: session.lastActiveAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    },
    messages,
  };
}

/**
 * Execute the grounded chatbot turn pipeline:
 * sanitize -> injection guard -> local intent/KB/catalog/ergo grounding -> provider adapter -> persist turn.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ userId: string|null, guestTokenHash: string|null }} owner
 * @param {{ message: string, locale?: 'en'|'vi', riderProfile?: object }} payload
 * @returns {Promise<object>}
 */
export async function sendChatMessage(app, owner, payload) {
  const startedAt = Date.now();
  const uiLocale = payload.locale === 'vi' ? 'vi' : 'en';
  const cleanedMessage = sanitizeChatInput(payload.message);

  if (!cleanedMessage) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      status: 400,
      title: 'Empty chat message',
      detail: 'Message cannot be empty after sanitization.',
    });
  }

  const effectiveLocale = resolveEffectiveLocale(cleanedMessage, uiLocale);

  const expiresAt = computeSessionExpiry(app.env, Boolean(owner.userId));
  let session = await findActiveSessionByOwner(app.prisma, { ...owner, now: new Date() });
  if (!session) {
    session = await createChatSession(app.prisma, {
      userId: owner.userId,
      guestTokenHash: owner.guestTokenHash,
      locale: effectiveLocale,
      expiresAt,
    });
  }

  const injectionCheck = detectPromptInjection(cleanedMessage);
  if (injectionCheck.blocked) {
    app.log.warn(
      { pattern: injectionCheck.matchedPattern, sessionId: session.id },
      'Blocked suspected prompt injection attempt in chatbot pipeline'
    );
    const refusalText = buildGuardrailRefusalMessage(effectiveLocale);
    const persisted = await persistChatTurn(app.prisma, {
      sessionId: session.id,
      locale: effectiveLocale,
      expiresAt,
      userContent: cleanedMessage,
      userIntent: CHAT_INTENTS.OUT_OF_SCOPE,
      assistantPayload: {
        content: refusalText,
        intent: CHAT_INTENTS.OUT_OF_SCOPE,
        citations: [],
        recommendedBikes: [],
        provider: 'guardrail',
        latencyMs: Math.max(1, Date.now() - startedAt),
      },
    });

    return {
      sessionId: session.id,
      userMessage: persisted.userMessage,
      assistantMessage: {
        ...persisted.assistantMessage,
        degraded: false,
      },
    };
  }

  const recentHistory = await listSessionMessages(app.prisma, session.id, 6);
  const groundedContext = await buildGroundedChatContext({
    app,
    message: cleanedMessage,
    locale: effectiveLocale,
    history: recentHistory,
    userId: owner.userId,
    riderProfileInput: payload.riderProfile ?? null,
  });

  const adapter = resolveChatAdapter(app.env, app.log);
  const adapterResult = await adapter.generate(groundedContext);
  const groundedContent = linkifyGroundedProducts(
    adapterResult.content,
    groundedContext.liveBikes,
    groundedContext.groundedAccessories
  );
  const latencyMs = Math.max(1, Date.now() - startedAt);

  const persisted = await persistChatTurn(app.prisma, {
    sessionId: session.id,
    locale: effectiveLocale,
    expiresAt,
    userContent: cleanedMessage,
    userIntent: groundedContext.intent,
    assistantPayload: {
      content: groundedContent,
      intent: groundedContext.intent,
      citations: groundedContext.citations,
      recommendedBikes: groundedContext.recommendedBikes,
      provider: adapterResult.provider,
      latencyMs,
    },
  });

  return {
    sessionId: session.id,
    userMessage: persisted.userMessage,
    assistantMessage: {
      ...persisted.assistantMessage,
      degraded: Boolean(adapterResult.degraded),
    },
  };
}

/**
 * Save UP/DOWN helpfulness feedback strictly for the owning user/guest session (anti-IDOR).
 * @param {import('fastify').FastifyInstance} app
 * @param {{ userId: string|null, guestTokenHash: string|null }} owner
 * @param {string} messageId
 * @param {'UP'|'DOWN'} feedback
 * @returns {Promise<{ message: object }>}
 */
export async function submitMessageFeedback(app, owner, messageId, feedback) {
  const existing = await findChatMessageWithSession(app.prisma, messageId);
  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.CHAT_MESSAGE_NOT_FOUND,
      status: 404,
      title: 'Chat message not found',
      detail: 'The specified chat message does not exist.',
    });
  }

  if (!isSessionOwner(existing.session, owner)) {
    throw new AppError({
      code: ERROR_CODES.FORBIDDEN,
      status: 403,
      title: 'Forbidden',
      detail: 'You do not have permission to rate messages in another user session.',
    });
  }

  if (existing.role !== CHAT_ROLES.ASSISTANT) {
    throw new AppError({
      code: ERROR_CODES.CHAT_FEEDBACK_NOT_ALLOWED,
      status: 400,
      title: 'Feedback not allowed on user message',
      detail: 'Feedback can only be recorded on assistant responses.',
    });
  }

  const updated = await updateChatMessageFeedback(app.prisma, messageId, feedback);
  return { message: updated };
}

/**
 * Reset/delete chat history strictly owned by the caller.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ userId: string|null, guestTokenHash: string|null }} owner
 * @returns {Promise<{ deletedSessions: number }>}
 */
export async function resetChatSession(app, owner) {
  const deletedSessions = await deleteOwnedChatSessions(app.prisma, owner);
  return { deletedSessions };
}

/**
 * Fetch anonymized chatbot telemetry metrics for ADMIN dashboard monitoring.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ days?: number }} query
 * @returns {Promise<{ metrics: object }>}
 */
export async function getAdminChatMetrics(app, query) {
  const metrics = await getAnonymizedChatMetrics(app.prisma, query);
  return { metrics };
}
