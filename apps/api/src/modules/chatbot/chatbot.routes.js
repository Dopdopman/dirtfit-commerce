import crypto from 'node:crypto';
import { z } from 'zod';
import {
  ChatFeedbackSchema,
  ChatMetricsQuerySchema,
  ChatSessionQuerySchema,
  SendChatMessageSchema,
  USER_ROLES,
  UuidSchema,
} from '@dirtfit/shared';
import { sendSuccess } from '../../common/http/envelope.js';
import { hashGuestChatToken } from './chatbot.repository.js';
import {
  getAdminChatMetrics,
  getOrInitChatSession,
  resetChatSession,
  sendChatMessage,
  submitMessageFeedback,
} from './chatbot.service.js';

export const CHAT_GUEST_COOKIE = 'df_chat_guest';

const MessageIdParamSchema = z.object({ id: UuidSchema }).strict();

/**
 * Resolve chat owner from authenticated JWT user or `df_chat_guest` cookie.
 * Issues a secure random `df_chat_guest` HttpOnly cookie for anonymous callers when creating/sending.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {boolean} issueGuestCookieIfMissing
 * @returns {{ userId: string|null, guestTokenHash: string|null }}
 */
function resolveChatOwner(request, reply, issueGuestCookieIfMissing = false) {
  if (request.authUser?.id) {
    return { userId: request.authUser.id, guestTokenHash: null };
  }

  const env = request.server.env;
  let rawGuestToken = request.cookies?.[CHAT_GUEST_COOKIE];
  if (typeof rawGuestToken !== 'string' || rawGuestToken.length < 16) {
    rawGuestToken = null;
  }

  if (!rawGuestToken && issueGuestCookieIfMissing) {
    rawGuestToken = crypto.randomBytes(24).toString('hex');
    reply.setCookie(CHAT_GUEST_COOKIE, rawGuestToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAME_SITE,
      path: '/api/v1',
      maxAge: env.CHAT_GUEST_SESSION_TTL_DAYS * 24 * 60 * 60,
    });
  }

  return {
    userId: null,
    guestTokenHash: rawGuestToken
      ? hashGuestChatToken(rawGuestToken, env.REFRESH_TOKEN_PEPPER)
      : null,
  };
}

/**
 * Derive isolated Redis rate-limit key for `POST /api/v1/chat/messages` (userId or IP).
 * Runs in onRequest before preHandler, so verifies Bearer access token non-destructively when supplied.
 * @param {import('fastify').FastifyRequest} request
 * @returns {string}
 */
function resolveChatRateLimitKey(request) {
  const authHeader = request.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const decoded = request.server.jwt.verify(token);
        if (decoded?.sub) {
          return `chat:user:${decoded.sub}`;
        }
      } catch {
        // Invalid/expired tokens safely fall back to IP keying
      }
    }
  }
  return `chat:ip:${request.ip}`;
}

/**
 * Grounded AI Support Chatbot & Admin Metrics routes (`/api/v1/chat/*`, `/api/v1/admin/chat/*`).
 * @param {import('fastify').FastifyInstance} app
 */
export default async function chatbotRoutes(app) {
  app.get(
    '/chat/session',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Chatbot'],
        summary: 'Get or initialize owned chat session with recent message history',
        querystring: ChatSessionQuerySchema,
      },
    },
    async (request, reply) => {
      const owner = resolveChatOwner(request, reply, true);
      const result = await getOrInitChatSession(app, owner, request.query ?? {});
      return sendSuccess(reply, result);
    }
  );

  app.post(
    '/chat/messages',
    {
      preHandler: [app.optionalAuth],
      config: {
        rateLimit: {
          max: app.env.CHAT_RATE_LIMIT_MAX,
          timeWindow: '1 minute',
          keyGenerator: resolveChatRateLimitKey,
        },
      },
      schema: {
        tags: ['Chatbot'],
        summary:
          'Send message through Grounded AI Pipeline (KB + CatalogCache + Ergonomics Engine)',
        body: SendChatMessageSchema,
      },
    },
    async (request, reply) => {
      const owner = resolveChatOwner(request, reply, true);
      const result = await sendChatMessage(app, owner, request.body);
      return sendSuccess(reply, result, { status: 201 });
    }
  );

  app.post(
    '/chat/messages/:id/feedback',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Chatbot'],
        summary: 'Submit UP/DOWN helpfulness feedback for an assistant message (anti-IDOR)',
        params: MessageIdParamSchema,
        body: ChatFeedbackSchema,
      },
    },
    async (request, reply) => {
      const owner = resolveChatOwner(request, reply, false);
      const result = await submitMessageFeedback(
        app,
        owner,
        request.params.id,
        request.body.feedback
      );
      return sendSuccess(reply, result);
    }
  );

  app.delete(
    '/chat/session',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Chatbot'],
        summary: 'Reset and clear owned chat session history',
      },
    },
    async (request, reply) => {
      const owner = resolveChatOwner(request, reply, false);
      const result = await resetChatSession(app, owner);
      return sendSuccess(reply, result);
    }
  );

  app.get(
    '/admin/chat/metrics',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin', 'Chatbot'],
        summary: 'Inspect anonymized chatbot telemetry and fallback/feedback rates (ADMIN only)',
        querystring: ChatMetricsQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await getAdminChatMetrics(app, request.query ?? {});
      return sendSuccess(reply, result);
    }
  );
}
