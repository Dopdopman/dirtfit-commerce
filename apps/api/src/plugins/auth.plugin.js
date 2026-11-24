import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { AppError, ERROR_CODES } from '@dirtfit/shared';

const REVOKED_JTI_PREFIX = 'df:jti:revoked:';

/**
 * Extract origin string from Origin header or fallback Referer header.
 * @param {import('fastify').FastifyRequest} request
 * @returns {string|null}
 */
function extractRequestOrigin(request) {
  const originHeader = request.headers.origin;
  if (typeof originHeader === 'string' && originHeader.trim().length > 0) {
    return originHeader.trim();
  }

  const refererHeader = request.headers.referer;
  if (typeof refererHeader === 'string' && refererHeader.trim().length > 0) {
    try {
      return new URL(refererHeader).origin;
    } catch {
      return 'INVALID_REFERER_ORIGIN';
    }
  }

  return null;
}

export default fp(
  async function authPlugin(app, opts) {
    const { env } = opts;

    await app.register(jwt, {
      secret: env.JWT_ACCESS_SECRET,
      sign: {
        expiresIn: env.JWT_ACCESS_TTL,
      },
    });

    app.decorate('revokeAccessTokenJti', async (jti, ttlSeconds = 900) => {
      if (!jti) {
        return;
      }
      await app.redis.set(`${REVOKED_JTI_PREFIX}${jti}`, '1', 'EX', Math.max(1, ttlSeconds));
    });

    app.decorate('requireAuth', async function requireAuth(request) {
      let payload;
      try {
        payload = await request.jwtVerify();
      } catch (err) {
        const isExpired = err?.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED';
        throw new AppError({
          code: isExpired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.UNAUTHORIZED,
          status: 401,
          title: 'Authentication required',
          detail: isExpired ? 'Access token has expired.' : 'Missing or invalid access token.',
        });
      }

      if (!payload?.sub || !payload?.role || !payload?.jti) {
        throw new AppError({
          code: ERROR_CODES.UNAUTHORIZED,
          status: 401,
          title: 'Invalid access token',
          detail: 'Token payload is missing required claims.',
        });
      }

      const isRevoked = await app.redis.get(`${REVOKED_JTI_PREFIX}${payload.jti}`);
      if (isRevoked) {
        throw new AppError({
          code: ERROR_CODES.UNAUTHORIZED,
          status: 401,
          title: 'Session revoked',
          detail: 'Access token has been revoked. Please sign in again.',
        });
      }

      request.authUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        jti: payload.jti,
        familyId: payload.familyId ?? null,
        exp: payload.exp ?? null,
      };
    });

    app.decorate('optionalAuth', async function optionalAuth(request) {
      const authHeader = request.headers.authorization;
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        await app.requireAuth(request);
        return;
      }
      request.authUser = null;
    });

    app.decorate('requireRoles', function requireRoles(...allowedRoles) {
      return async function enforceRoles(request) {
        if (!request.authUser) {
          throw new AppError({
            code: ERROR_CODES.UNAUTHORIZED,
            status: 401,
            title: 'Authentication required',
            detail: 'You must be authenticated to access this resource.',
          });
        }

        if (!allowedRoles.includes(request.authUser.role)) {
          throw new AppError({
            code: ERROR_CODES.FORBIDDEN,
            status: 403,
            title: 'Insufficient permissions',
            detail: `Required role: ${allowedRoles.join(' or ')}.`,
          });
        }
      };
    });

    app.decorate('verifyOriginCsrf', async function verifyOriginCsrf(request) {
      const origin = extractRequestOrigin(request);
      if (origin === null) {
        if (env.NODE_ENV === 'production') {
          throw new AppError({
            code: ERROR_CODES.FORBIDDEN,
            status: 403,
            title: 'Missing Origin header',
            detail: 'Origin or Referer header is required for cookie-authenticated endpoints.',
          });
        }
        return;
      }

      if (!env.CORS_ALLOWED_ORIGINS.includes(origin)) {
        throw new AppError({
          code: ERROR_CODES.FORBIDDEN,
          status: 403,
          title: 'CSRF origin rejected',
          detail: 'Request origin is not in the allowed whitelist.',
        });
      }
    });
  },
  {
    name: 'auth-plugin',
    dependencies: ['redis-plugin'],
  }
);
