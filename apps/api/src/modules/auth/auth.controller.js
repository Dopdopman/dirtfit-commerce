import { sendSuccess } from '../../common/http/envelope.js';
import {
  getAuthenticatedMe,
  loginUser,
  logoutAllSessions,
  logoutCurrentSession,
  registerUser,
  rotateRefreshSession,
} from './auth.service.js';

export const REFRESH_COOKIE_NAME = 'df_refresh_token';

/**
 * Extract request metadata for token tracking and audit logs.
 * @param {import('fastify').FastifyRequest} request
 * @returns {{ ipAddress: string, userAgent: string|null, requestId: string }}
 */
function buildRequestContext(request) {
  return {
    ipAddress: request.ip,
    userAgent:
      typeof request.headers['user-agent'] === 'string'
        ? request.headers['user-agent'].slice(0, 512)
        : null,
    requestId: String(request.id),
  };
}

/**
 * Set HttpOnly Refresh Token cookie according to runtime environment policy.
 * @param {import('fastify').FastifyReply} reply
 * @param {string} rawToken
 * @param {object} env
 */
function setRefreshCookie(reply, rawToken, env) {
  reply.setCookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

/**
 * Clear the Refresh Token cookie.
 * @param {import('fastify').FastifyReply} reply
 * @param {object} env
 */
function clearRefreshCookie(reply, env) {
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/v1/auth',
  });
}

/**
 * Handle POST /api/v1/auth/register.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function registerHandler(request, reply) {
  const result = await registerUser(request.server, request.body, buildRequestContext(request));
  setRefreshCookie(reply, result.rawRefreshToken, request.server.env);
  return sendSuccess(
    reply,
    { user: result.user, accessToken: result.accessToken },
    { status: 201 }
  );
}

/**
 * Handle POST /api/v1/auth/login.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function loginHandler(request, reply) {
  const result = await loginUser(request.server, request.body, buildRequestContext(request));
  setRefreshCookie(reply, result.rawRefreshToken, request.server.env);
  return sendSuccess(reply, { user: result.user, accessToken: result.accessToken });
}

/**
 * Handle POST /api/v1/auth/refresh.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function refreshHandler(request, reply) {
  const rawToken = request.cookies?.[REFRESH_COOKIE_NAME];
  try {
    const result = await rotateRefreshSession(
      request.server,
      rawToken,
      buildRequestContext(request)
    );
    setRefreshCookie(reply, result.rawRefreshToken, request.server.env);
    return sendSuccess(reply, { accessToken: result.accessToken });
  } catch (err) {
    clearRefreshCookie(reply, request.server.env);
    throw err;
  }
}

/**
 * Handle POST /api/v1/auth/logout.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function logoutHandler(request, reply) {
  const rawToken = request.cookies?.[REFRESH_COOKIE_NAME];
  await logoutCurrentSession(request.server, request.authUser, rawToken);
  clearRefreshCookie(reply, request.server.env);
  return reply.code(204).send();
}

/**
 * Handle POST /api/v1/auth/logout-all.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function logoutAllHandler(request, reply) {
  await logoutAllSessions(request.server, request.authUser, buildRequestContext(request));
  clearRefreshCookie(reply, request.server.env);
  return reply.code(204).send();
}

/**
 * Handle GET /api/v1/auth/me.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function meHandler(request, reply) {
  const user = await getAuthenticatedMe(request.server, request.authUser.id);
  return sendSuccess(reply, { user });
}
