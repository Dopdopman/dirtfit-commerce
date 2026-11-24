import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppError, ERROR_CODES } from '@dirtfit/shared';

export default fp(
  async function securityPlugin(app, opts) {
    const { env, rateLimitNamespace = 'df:rl:' } = opts;

    await app.register(helmet, {
      contentSecurityPolicy: env.SWAGGER_ENABLED ? false : undefined,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    });

    await app.register(cors, {
      origin: (origin, callback) => {
        if (!origin || env.CORS_ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(
          new AppError({
            code: ERROR_CODES.FORBIDDEN,
            status: 403,
            title: 'CORS origin not allowed',
            detail: 'Origin is not permitted by CORS policy.',
          }),
          false
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    });

    await app.register(cookie, {
      secret: env.COOKIE_SECRET,
      parseOptions: {},
    });

    await app.register(rateLimit, {
      global: true,
      redis: app.redis,
      nameSpace: rateLimitNamespace,
      max: env.RATE_LIMIT_GLOBAL_MAX,
      timeWindow: '1 minute',
      allowList: (request) => request.url === '/health/live',
      addHeadersOnExceeding: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
      },
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
        'retry-after': true,
      },
      errorResponseBuilder: (_request, context) => {
        const err = new AppError({
          code: ERROR_CODES.RATE_LIMITED,
          status: 429,
          title: 'Too Many Requests',
          detail: `Rate limit exceeded. Retry after ${context.after}.`,
        });
        err.statusCode = 429;
        return err;
      },
    });
  },
  {
    name: 'security-plugin',
    dependencies: ['redis-plugin'],
  }
);
