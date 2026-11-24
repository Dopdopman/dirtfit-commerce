import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';

export default fp(
  async function redisPlugin(app, opts = {}) {
    const { env } = opts;
    const owned = !opts.redisClient;
    const redis =
      opts.redisClient ??
      new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: false,
      });

    const l1Cache = new LRUCache({
      max: 500,
      ttl: 30_000,
    });

    app.decorate('redis', redis);
    app.decorate('l1Cache', l1Cache);

    if (owned) {
      app.addHook('onClose', async () => {
        try {
          await redis.quit();
        } catch {
          redis.disconnect();
        }
      });
    }
  },
  { name: 'redis-plugin' }
);
