import { LoginSchema, RegisterSchema } from '@dirtfit/shared';
import {
  loginHandler,
  logoutAllHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
} from './auth.controller.js';

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
        summary: 'Get current authenticated user and saved body profiles',
        security: [{ bearerAuth: [] }],
      },
    },
    meHandler
  );
}
