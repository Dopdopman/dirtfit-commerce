/**
 * Healthcheck endpoints (/health/live and /health/ready).
 * @param {import('fastify').FastifyInstance} app
 */
export default async function healthRoutes(app) {
  app.get(
    '/health/live',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['Health'],
        summary: 'Instant process liveness probe (no external I/O)',
      },
    },
    async (_request, reply) => {
      return reply.code(200).send({
        status: 'live',
        uptimeSec: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }
  );

  app.get(
    '/health/ready',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['Health'],
        summary: 'Readiness probe verifying PostgreSQL and Redis connectivity',
      },
    },
    async (_request, reply) => {
      const checks = {
        postgres: 'down',
        redis: 'down',
      };

      try {
        await app.prisma.$queryRaw`SELECT 1`;
        checks.postgres = 'ok';
      } catch {
        checks.postgres = 'error';
      }

      try {
        const pong = await app.redis.ping();
        checks.redis = pong === 'PONG' ? 'ok' : 'error';
      } catch {
        checks.redis = 'error';
      }

      const isReady = checks.postgres === 'ok' && checks.redis === 'ok';
      return reply.code(isReady ? 200 : 503).send({
        status: isReady ? 'ready' : 'degraded',
        checks,
        timestamp: new Date().toISOString(),
      });
    }
  );
}
