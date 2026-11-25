import { AppError, ERROR_CODES } from '@dirtfit/shared';
import { sendSuccess } from '../../common/http/envelope.js';
import { mergeGuestCartToUser } from '../cart/cart.repository.js';
import { hashGuestChatToken, mergeGuestChatSessionToUser } from '../chatbot/chatbot.repository.js';
import { CHAT_GUEST_COOKIE } from '../chatbot/chatbot.routes.js';
import {
  getAuthenticatedMe,
  loginUser,
  logoutAllSessions,
  logoutCurrentSession,
  registerUser,
  rotateRefreshSession,
} from './auth.service.js';
import { resolveGoogleOAuthAdapter } from './oauth/oauth.adapter.js';
import {
  OAUTH_TX_COOKIE_NAME,
  OAUTH_TX_TTL_SECONDS,
  exchangeOAuthTicket,
  handleGoogleOAuthCallback,
  setLocalPassword,
  startGoogleOAuth,
} from './oauth/oauth.service.js';

export const REFRESH_COOKIE_NAME = 'df_refresh_token';
const GUEST_CART_COOKIE_NAME = 'df_guest_cart';

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
 * Set short-lived encrypted OAuth transaction cookie (`df_oauth_tx`, SameSite=Lax for GET callback).
 * @param {import('fastify').FastifyReply} reply
 * @param {string} encryptedPayload
 * @param {object} env
 */
function setOAuthTxCookie(reply, encryptedPayload, env) {
  reply.setCookie(OAUTH_TX_COOKIE_NAME, encryptedPayload, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/v1/auth/google',
    maxAge: OAUTH_TX_TTL_SECONDS,
  });
}

/**
 * Clear the short-lived OAuth transaction cookie immediately upon callback receipt.
 * @param {import('fastify').FastifyReply} reply
 * @param {object} env
 */
function clearOAuthTxCookie(reply, env) {
  reply.clearCookie(OAUTH_TX_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/v1/auth/google',
  });
}

/**
 * Merge anonymous guest cart (and future guest chat session in Phase 11) into authenticated user.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function mergeGuestSessionsAfterAuth(request, reply, userId) {
  const guestCartToken = request.cookies?.[GUEST_CART_COOKIE_NAME];
  if (typeof guestCartToken === 'string' && guestCartToken.length > 0) {
    await mergeGuestCartToUser(request.server.prisma, guestCartToken, userId);
    reply.clearCookie(GUEST_CART_COOKIE_NAME, { path: '/api/v1' });
  }

  const rawGuestChatToken = request.cookies?.[CHAT_GUEST_COOKIE];
  if (typeof rawGuestChatToken === 'string' && rawGuestChatToken.length >= 16) {
    const guestTokenHash = hashGuestChatToken(
      rawGuestChatToken,
      request.server.env.REFRESH_TOKEN_PEPPER
    );
    await mergeGuestChatSessionToUser(request.server.prisma, guestTokenHash, userId);
    reply.clearCookie(CHAT_GUEST_COOKIE, { path: '/api/v1' });
  }
}

/**
 * Handle POST /api/v1/auth/register.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function registerHandler(request, reply) {
  const result = await registerUser(request.server, request.body, buildRequestContext(request));
  await mergeGuestSessionsAfterAuth(request, reply, result.user.id);
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
  await mergeGuestSessionsAfterAuth(request, reply, result.user.id);
  setRefreshCookie(reply, result.rawRefreshToken, request.server.env);
  return sendSuccess(reply, { user: result.user, accessToken: result.accessToken });
}

/**
 * Handle GET /api/v1/auth/providers.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function authProvidersHandler(request, reply) {
  const env = request.server.env;
  return sendSuccess(reply, {
    googleEnabled: Boolean(env.GOOGLE_OAUTH_ENABLED),
    mockOAuthEnabled: env.NODE_ENV !== 'production' && Boolean(env.ENABLE_MOCK_OAUTH),
  });
}

/**
 * Handle GET /api/v1/auth/google and GET /api/v1/auth/google/start.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function googleOAuthStartHandler(request, reply) {
  const { authorizationUrl, encryptedTxCookie } = startGoogleOAuth(request.server, request.query);
  setOAuthTxCookie(reply, encryptedTxCookie, request.server.env);
  return reply.redirect(authorizationUrl);
}

/**
 * Handle GET /api/v1/auth/google/mock-authorize (mounted non-prod only when ENABLE_MOCK_OAUTH=true).
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function googleOAuthMockAuthorizeHandler(request, reply) {
  const env = request.server.env;
  if (env.NODE_ENV === 'production' || !env.ENABLE_MOCK_OAUTH) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Mock OAuth disabled',
      detail: 'Mock Google OAuth endpoint is disabled.',
    });
  }

  const adapter = resolveGoogleOAuthAdapter(env);
  const redirectTarget = adapter.buildMockCallbackRedirectUrl(request.query || {});
  return reply.redirect(redirectTarget);
}

/**
 * Handle GET /api/v1/auth/google/callback.
 * Always clears df_oauth_tx; redirects browsers cleanly on error or returns RFC 7807 JSON to API clients.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function googleOAuthCallbackHandler(request, reply) {
  const encryptedTxCookie = request.cookies?.[OAUTH_TX_COOKIE_NAME];
  clearOAuthTxCookie(reply, request.server.env);

  try {
    const { ticket, returnTo } = await handleGoogleOAuthCallback(
      request.server,
      request.query,
      encryptedTxCookie,
      buildRequestContext(request)
    );

    const frontendBase = request.server.env.APP_URL.replace(/\/+$/, '');
    const handoffUrl = new URL(`${frontendBase}/auth/callback`);
    handoffUrl.searchParams.set('ticket', ticket);
    handoffUrl.searchParams.set('next', returnTo);
    return reply.redirect(handoffUrl.toString());
  } catch (err) {
    const acceptHeader = String(request.headers.accept || '');
    if (acceptHeader.includes('text/html') && !acceptHeader.includes('application/json')) {
      const frontendBase = request.server.env.APP_URL.replace(/\/+$/, '');
      const errorCode = err instanceof AppError ? err.code : ERROR_CODES.OAUTH_ID_TOKEN_INVALID;
      const loginErrorUrl = new URL(`${frontendBase}/login`);
      loginErrorUrl.searchParams.set('oauthError', errorCode);
      return reply.redirect(loginErrorUrl.toString());
    }
    throw err;
  }
}

/**
 * Handle POST /api/v1/auth/oauth/exchange.
 * Exchanges single-use ticket for JWT + Refresh Cookie + merges guest cart/chat.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function oauthExchangeHandler(request, reply) {
  const result = await exchangeOAuthTicket(
    request.server,
    request.body.ticket,
    buildRequestContext(request)
  );
  await mergeGuestSessionsAfterAuth(request, reply, result.user.id);
  setRefreshCookie(reply, result.rawRefreshToken, request.server.env);
  return sendSuccess(reply, {
    user: result.user,
    accessToken: result.accessToken,
    returnTo: result.returnTo,
  });
}

/**
 * Handle POST /api/v1/auth/set-password.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<import('fastify').FastifyReply>}
 */
export async function setPasswordHandler(request, reply) {
  const user = await setLocalPassword(
    request.server,
    request.authUser.id,
    request.body.newPassword,
    buildRequestContext(request)
  );
  return sendSuccess(reply, { user });
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
