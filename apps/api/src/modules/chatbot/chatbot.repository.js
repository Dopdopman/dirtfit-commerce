import crypto from 'node:crypto';
import { CHAT_FEEDBACK, CHAT_ROLES } from '@dirtfit/shared';

const AUTH_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Derive deterministic HMAC-SHA256 hash of raw `df_chat_guest` cookie token.
 * Prevents raw session tokens from ever resting in PostgreSQL.
 * @param {string} rawToken
 * @param {string} pepper
 * @returns {string}
 */
export function hashGuestChatToken(rawToken, pepper) {
  return crypto.createHmac('sha256', pepper).update(String(rawToken)).digest('hex');
}

/**
 * Map Prisma ChatMessage record into safe public/storefront DTO.
 * @param {object} row
 * @returns {object}
 */
export function mapChatMessage(row) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    intent: row.intent ?? null,
    citations: Array.isArray(row.citationsJson) ? row.citationsJson : [],
    recommendedBikes: Array.isArray(row.recommendedBikesJson) ? row.recommendedBikesJson : [],
    provider: row.provider ?? null,
    latencyMs: row.latencyMs ?? null,
    feedback: row.feedback ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

/**
 * Find the active chat session for either an authenticated user or anonymous guest token hash.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId?: string|null, guestTokenHash?: string|null, now?: Date }} owner
 * @returns {Promise<object|null>}
 */
export async function findActiveSessionByOwner(
  prisma,
  { userId = null, guestTokenHash = null, now = new Date() }
) {
  if (userId) {
    return prisma.chatSession.findFirst({
      where: { userId },
      orderBy: [{ lastActiveAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  if (guestTokenHash) {
    return prisma.chatSession.findFirst({
      where: {
        guestTokenHash,
        expiresAt: { gt: now },
      },
    });
  }

  return null;
}

/**
 * Create a new ChatSession for either an authenticated user or anonymous guest.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId?: string|null, guestTokenHash?: string|null, locale: string, expiresAt: Date }} params
 * @returns {Promise<object>}
 */
export async function createChatSession(
  prisma,
  { userId = null, guestTokenHash = null, locale = 'en', expiresAt }
) {
  return prisma.chatSession.create({
    data: {
      userId: userId ?? null,
      guestTokenHash: userId ? null : guestTokenHash,
      locale: locale === 'vi' ? 'vi' : 'en',
      lastActiveAt: new Date(),
      expiresAt: expiresAt ?? new Date(Date.now() + AUTH_SESSION_TTL_MS),
    },
  });
}

/**
 * Fetch the latest N messages for a chat session in ascending chronological order.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} sessionId
 * @param {number} [limit]
 * @returns {Promise<Array<object>>}
 */
export async function listSessionMessages(prisma, sessionId, limit = 50) {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  return rows.reverse().map(mapChatMessage);
}

/**
 * Atomically persist USER and ASSISTANT messages for a chat turn and refresh session activity/expiry.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.locale
 * @param {Date} params.expiresAt
 * @param {string} params.userContent
 * @param {string|null} [params.userIntent]
 * @param {object} params.assistantPayload
 * @returns {Promise<{ userMessage: object, assistantMessage: object }>}
 */
export async function persistChatTurn(
  prisma,
  { sessionId, locale, expiresAt, userContent, userIntent, assistantPayload }
) {
  const now = new Date();
  const assistantCreatedAt = new Date(now.getTime() + 1);

  return prisma.$transaction(async (tx) => {
    const userRow = await tx.chatMessage.create({
      data: {
        sessionId,
        role: CHAT_ROLES.USER,
        content: userContent,
        intent: userIntent ?? null,
        createdAt: now,
      },
    });

    const assistantRow = await tx.chatMessage.create({
      data: {
        sessionId,
        role: CHAT_ROLES.ASSISTANT,
        content: assistantPayload.content,
        intent: assistantPayload.intent ?? null,
        citationsJson: assistantPayload.citations ?? [],
        recommendedBikesJson: assistantPayload.recommendedBikes ?? [],
        provider: assistantPayload.provider ?? 'grounded-fallback',
        latencyMs: assistantPayload.latencyMs ?? null,
        createdAt: assistantCreatedAt,
      },
    });

    await tx.chatSession.update({
      where: { id: sessionId },
      data: {
        locale: locale === 'vi' ? 'vi' : 'en',
        lastActiveAt: assistantCreatedAt,
        expiresAt,
      },
    });

    return {
      userMessage: mapChatMessage(userRow),
      assistantMessage: mapChatMessage(assistantRow),
    };
  });
}

/**
 * Load a single ChatMessage alongside its owning ChatSession (for strict anti-IDOR checks).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} messageId
 * @returns {Promise<object|null>}
 */
export async function findChatMessageWithSession(prisma, messageId) {
  return prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: {
      session: {
        select: {
          id: true,
          userId: true,
          guestTokenHash: true,
          expiresAt: true,
        },
      },
    },
  });
}

/**
 * Record customer feedback (UP / DOWN) on an assistant message.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} messageId
 * @param {'UP'|'DOWN'} feedback
 * @returns {Promise<object>}
 */
export async function updateChatMessageFeedback(prisma, messageId, feedback) {
  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { feedback },
  });
  return mapChatMessage(updated);
}

/**
 * Delete all chat sessions owned by the caller (used for session reset).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId?: string|null, guestTokenHash?: string|null }} owner
 * @returns {Promise<number>}
 */
export async function deleteOwnedChatSessions(prisma, { userId = null, guestTokenHash = null }) {
  if (!userId && !guestTokenHash) {
    return 0;
  }
  const result = await prisma.chatSession.deleteMany({
    where: userId ? { userId } : { guestTokenHash },
  });
  return result.count;
}

/**
 * Merge anonymous guest chat session into authenticated user's session upon login/register/OAuth.
 * Ensures seamless multi-turn continuity without losing prior guest messages.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} guestTokenHash
 * @param {string} userId
 * @returns {Promise<{ merged: boolean, targetSessionId: string|null }>}
 */
export async function mergeGuestChatSessionToUser(prisma, guestTokenHash, userId) {
  if (!guestTokenHash || !userId) {
    return { merged: false, targetSessionId: null };
  }

  return prisma.$transaction(async (tx) => {
    const guestSession = await tx.chatSession.findUnique({
      where: { guestTokenHash },
    });

    if (!guestSession) {
      return { merged: false, targetSessionId: null };
    }

    // Remove expired guest sessions cleanly if already past TTL
    if (guestSession.expiresAt <= new Date()) {
      await tx.chatSession.delete({ where: { id: guestSession.id } });
      return { merged: false, targetSessionId: null };
    }

    const existingUserSession = await tx.chatSession.findFirst({
      where: { userId },
      orderBy: [{ lastActiveAt: 'desc' }, { createdAt: 'desc' }],
    });

    const newExpiresAt = new Date(Date.now() + AUTH_SESSION_TTL_MS);

    if (!existingUserSession) {
      await tx.chatSession.update({
        where: { id: guestSession.id },
        data: {
          userId,
          guestTokenHash: null,
          lastActiveAt: new Date(),
          expiresAt: newExpiresAt,
        },
      });
      return { merged: true, targetSessionId: guestSession.id };
    }

    await tx.chatMessage.updateMany({
      where: { sessionId: guestSession.id },
      data: { sessionId: existingUserSession.id },
    });

    await tx.chatSession.update({
      where: { id: existingUserSession.id },
      data: {
        lastActiveAt: new Date(),
        expiresAt: newExpiresAt,
      },
    });

    await tx.chatSession.delete({
      where: { id: guestSession.id },
    });

    return { merged: true, targetSessionId: existingUserSession.id };
  });
}

function computePercentile(sortedValues, pct) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const idx = Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * pct));
  return sortedValues[idx];
}

/**
 * Compute anonymized chatbot telemetry & quality metrics (Admin-only, strictly ZERO PII or message text).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ days?: number }} [query]
 * @returns {Promise<object>}
 */
export async function getAnonymizedChatMetrics(prisma, { days = 7 } = {}) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalSessions, roleGroups, intentGroups, providerGroups, feedbackGroups, latencies] =
    await Promise.all([
      prisma.chatSession.count({
        where: { createdAt: { gte: cutoff } },
      }),
      prisma.chatMessage.groupBy({
        by: ['role'],
        where: { createdAt: { gte: cutoff } },
        _count: { _all: true },
      }),
      prisma.chatMessage.groupBy({
        by: ['intent'],
        where: {
          createdAt: { gte: cutoff },
          role: CHAT_ROLES.ASSISTANT,
          intent: { not: null },
        },
        _count: { _all: true },
      }),
      prisma.chatMessage.groupBy({
        by: ['provider'],
        where: {
          createdAt: { gte: cutoff },
          role: CHAT_ROLES.ASSISTANT,
          provider: { not: null },
        },
        _count: { _all: true },
      }),
      prisma.chatMessage.groupBy({
        by: ['feedback'],
        where: {
          createdAt: { gte: cutoff },
          role: CHAT_ROLES.ASSISTANT,
          feedback: { not: null },
        },
        _count: { _all: true },
      }),
      prisma.chatMessage.findMany({
        where: {
          createdAt: { gte: cutoff },
          role: CHAT_ROLES.ASSISTANT,
          latencyMs: { not: null },
        },
        select: { latencyMs: true },
        orderBy: { latencyMs: 'asc' },
        take: 1000,
      }),
    ]);

  let userMessages = 0;
  let assistantMessages = 0;
  for (const row of roleGroups) {
    if (row.role === CHAT_ROLES.USER) {
      userMessages = row._count._all;
    } else if (row.role === CHAT_ROLES.ASSISTANT) {
      assistantMessages = row._count._all;
    }
  }

  const intentBreakdown = {};
  for (const row of intentGroups) {
    if (row.intent) {
      intentBreakdown[row.intent] = row._count._all;
    }
  }

  const providerBreakdown = {};
  for (const row of providerGroups) {
    if (row.provider) {
      providerBreakdown[row.provider] = row._count._all;
    }
  }

  const fallbackCount = providerBreakdown['grounded-fallback'] ?? 0;
  const fallbackRate =
    assistantMessages > 0 ? Math.round((fallbackCount / assistantMessages) * 1000) / 10 : 0;

  let upCount = 0;
  let downCount = 0;
  for (const row of feedbackGroups) {
    if (row.feedback === CHAT_FEEDBACK.UP) {
      upCount = row._count._all;
    } else if (row.feedback === CHAT_FEEDBACK.DOWN) {
      downCount = row._count._all;
    }
  }
  const totalFeedback = upCount + downCount;
  const positiveRate = totalFeedback > 0 ? Math.round((upCount / totalFeedback) * 1000) / 10 : null;

  const latencyValues = latencies
    .map((r) => r.latencyMs)
    .filter((v) => typeof v === 'number' && v >= 0);
  const avgLatency =
    latencyValues.length > 0
      ? Math.round(latencyValues.reduce((sum, v) => sum + v, 0) / latencyValues.length)
      : 0;

  return {
    windowDays: days,
    totalSessions,
    totalMessages: userMessages + assistantMessages,
    userMessages,
    assistantMessages,
    intentBreakdown,
    providerBreakdown,
    fallbackCount,
    fallbackRate,
    feedbackSummary: {
      up: upCount,
      down: downCount,
      totalFeedback,
      positiveRate,
    },
    latencyMs: {
      avg: avgLatency,
      p50: computePercentile(latencyValues, 0.5),
      p95: computePercentile(latencyValues, 0.95),
    },
  };
}
