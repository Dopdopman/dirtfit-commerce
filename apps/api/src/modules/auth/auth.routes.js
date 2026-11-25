import {
  LoginSchema,
  OAuthExchangeSchema,
  RegisterSchema,
  SetPasswordSchema,
} from '@dirtfit/shared';
import { z } from 'zod';
import {
  authProvidersHandler,
  googleOAuthCallbackHandler,
  googleOAuthMockAuthorizeHandler,
  googleOAuthStartHandler,
  loginHandler,
  logoutAllHandler,
  logoutHandler,
  meHandler,
  oauthExchangeHandler,
  refreshHandler,
  registerHandler,
  setPasswordHandler,
} from './auth.controller.js';

const OAuthStartQuerySchema = z.object({
  next: z.string().max(512).optional(),
  returnTo: z.string().max(512).optional(),
  persona: z.string().max(64).optional(),
  email: z.string().max(255).optional(),
  name: z.string().max(120).optional(),
  sub: z.string().max(128).optional(),
});

/**
 * Auth module routes (/api/v1/auth/*).
 * @param {import('fastify').FastifyInstance} app
 */
export default async function authRoutes(app) {
  const authRateLimit = {
    rateLimit: {
      max: app.env.RATE_LIMIT_AUTH_MAX,
      timeWindow: '1 minute',
    },
  };

  app.get(
    '/auth/providers',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Inspect enabled authentication providers (Google OAuth / Mock flag)',
      },
    },
    authProvidersHandler
  );

  app.post(
    '/auth/register',
    {
      config: authRateLimit,
      schema: {
        tags: ['Auth'],
        summary: 'Register a new customer account',
        body: RegisterSchema,
      },
    },
    registerHandler
  );

  app.post(
    '/auth/login',
    {
      config: authRateLimit,
      schema: {
        tags: ['Auth'],
        summary: 'Sign in with email & password (issues JWT + HttpOnly refresh cookie)',
        body: LoginSchema,
      },
    },
    loginHandler
  );

  app.get(
    '/auth/google',
    {
      config: authRateLimit,
      schema: {
        tags: ['Auth', 'OAuth'],
        summary: 'Initiate Google OAuth 2.0 PKCE authorization redirect',
        querystring: OAuthStartQuerySchema,
      },
    },
    googleOAuthStartHandler
  );

  app.get(
    '/auth/google/start',
    {
      config: authRateLimit,
      schema: {
        tags: ['Auth', 'OAuth'],
        summary: 'Alias for GET /api/v1/auth/google',
        querystring: OAuthStartQuerySchema,
      },
    },
    googleOAuthStartHandler
  );

  app.get(
    '/auth/google/callback',
    {
      config: authRateLimit,
      schema: {
        tags: ['Auth', 'OAuth'],
        summary:
          'Google OAuth 2.0 callback verifying state, PKCE, OIDC id_token, and issuing One-Time Ticket',
      },
    },
    googleOAuthCallbackHandler
  );

  // Security Gate: Mock OAuth endpoint NEVER mounted in production or when ENABLE_MOCK_OAUTH=false
  if (app.env.NODE_ENV !== 'production' && app.env.ENABLE_MOCK_OAUTH) {
    app.get(
      '/auth/google/mock-authorize',
      {
        config: authRateLimit,
        schema: {
          tags: ['Auth', 'OAuth'],
          summary: 'Non-production mock Google authorize endpoint for automated testing',
        },
      },
      googleOAuthMockAuthorizeHandler
    );
  }

  app.post(
    '/auth/oauth/exchange',
    {
      preHandler: [app.verifyOriginCsrf],
      config: authRateLimit,
      schema: {
        tags: ['Auth', 'OAuth'],
        summary: 'Exchange single-use OAuth ticket for JWT Access Token + HttpOnly Refresh Cookie',
        body: OAuthExchangeSchema,
      },
    },
    oauthExchangeHandler
  );

  app.post(
    '/auth/set-password',
    {
      preHandler: [app.requireAuth, app.verifyOriginCsrf],
      config: authRateLimit,
      schema: {
        tags: ['Auth', 'OAuth'],
        summary: 'Set a local Argon2id password for a passwordless OAuth account',
        security: [{ bearerAuth: [] }],
        body: SetPasswordSchema,
      },
    },
    setPasswordHandler
  );

  app.post(
    '/auth/refresh',
    {
      preHandler: [app.verifyOriginCsrf],
      config: authRateLimit,
      schema: {
        tags: ['Auth'],
        summary: 'Rotate refresh token with reuse-attack detection',
      },
    },
    refreshHandler
  );

  app.post(
    '/auth/logout',
    {
      preHandler: [app.requireAuth, app.verifyOriginCsrf],
      schema: {
        tags: ['Auth'],
        summary: 'Logout current session and revoke token family',
        security: [{ bearerAuth: [] }],
      },
    },
    logoutHandler
  );

  app.post(
    '/auth/logout-all',
    {
      preHandler: [app.requireAuth],
      config: authRateLimit,
      schema: {
        tags: ['Auth'],
        summary: 'Revoke all refresh tokens across all devices',
        security: [{ bearerAuth: [] }],
      },
    },
    logoutAllHandler
  );

  app.get(
    '/auth/me',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Auth'],
        summary: 'Get current authenticated user, linked OAuth providers, and saved body profiles',
        security: [{ bearerAuth: [] }],
      },
    },
    meHandler
  );
}
