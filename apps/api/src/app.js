import crypto from 'node:crypto';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { loadEnv } from './config/env.js';
import accessoriesRoutes from './modules/accessories/accessories.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import healthRoutes from './modules/health/health.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import simulatorRoutes from './modules/simulator/simulator.routes.js';
import sweeperRoutes from './modules/sweeper/sweeper.routes.js';
import testRidesRoutes from './modules/test-rides/test-rides.routes.js';
import uploadsRoutes from './modules/uploads/uploads.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import authPlugin from './plugins/auth.plugin.js';
import errorHandlerPlugin from './plugins/error-handler.plugin.js';
import prismaPlugin from './plugins/prisma.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';
import securityPlugin from './plugins/security.plugin.js';
import storagePlugin from './plugins/storage.plugin.js';
import swaggerPlugin from './plugins/swagger.plugin.js';

const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Build and configure the Fastify application instance without binding a port.
 * Supports Vitest `app.inject()` and custom dependency/env overrides.
 * @param {object} [options]
 * @param {object} [options.envOverrides]
 * @param {boolean} [options.logger]
 * @param {object} [options.prismaClient]
 * @param {object} [options.redisClient]
 * @param {object} [options.storageAdapter]
 * @param {string} [options.rateLimitNamespace]
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function buildApp(options = {}) {
  const env = loadEnv(options.envOverrides);
  const enableLogger = options.logger ?? env.NODE_ENV !== 'test';

  const app = Fastify({
    trustProxy: true,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string' && SAFE_REQUEST_ID_REGEX.test(incoming)) {
        return incoming;
      }
      return crypto.randomUUID();
    },
    logger: enableLogger
      ? {
          level: env.LOG_LEVEL,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              '*.password',
              '*.newPassword',
              '*.passwordHash',
              '*.refreshToken',
              '*.rawRefreshToken',
              '*.tokenHash',
            ],
            censor: '[REDACTED]',
          },
        }
      : false,
  });

  app.decorate('env', env);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', String(request.id));
  });

  // Strict plugin registration order
  await app.register(prismaPlugin, { prismaClient: options.prismaClient });
  await app.register(redisPlugin, { env, redisClient: options.redisClient });
  await app.register(storagePlugin, { env, storageAdapter: options.storageAdapter });
  await app.register(securityPlugin, {
    env,
    rateLimitNamespace: options.rateLimitNamespace,
  });
  await app.register(swaggerPlugin, { env });
  await app.register(errorHandlerPlugin, { env });
  await app.register(authPlugin, { env });

  // Root health probes
  await app.register(healthRoutes);

  // Versioned API routes (/api/v1)
  await app.register(
    async function v1Routes(api) {
      await api.register(authRoutes);
      await api.register(usersRoutes);
      await api.register(catalogRoutes);
      await api.register(accessoriesRoutes);
      await api.register(simulatorRoutes);
      await api.register(cartRoutes);
      await api.register(ordersRoutes);
      await api.register(paymentsRoutes);
      await api.register(testRidesRoutes);
      await api.register(sweeperRoutes);
      await api.register(uploadsRoutes);
      await api.register(auditRoutes);
    },
    { prefix: '/api/v1' }
  );

  await app.ready();
  return app;
}
