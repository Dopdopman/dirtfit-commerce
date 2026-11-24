export const CATALOG_CACHE_PREFIX = 'df:catalog:';

export const CATALOG_KEYS = Object.freeze({
  BRANDS: `${CATALOG_CACHE_PREFIX}brands`,
  BIKE_FIT_PROJECTIONS: `${CATALOG_CACHE_PREFIX}bikes:fit-projections`,
  bikeDetail: (slug) => `${CATALOG_CACHE_PREFIX}bike:slug:${slug}`,
  accessoryDetail: (slug) => `${CATALOG_CACHE_PREFIX}accessory:slug:${slug}`,
});

/**
 * Read-through two-tier cache: L1 in-memory LRU (30s) -> L2 Redis (configurable TTL) -> DB loader.
 * Gracefully degrades to loader on transient Redis failure.
 * @template T
 * @param {import('fastify').FastifyInstance} app
 * @param {string} key
 * @param {() => Promise<T>} loader
 * @param {object} [options]
 * @param {number} [options.l2TtlSec]
 * @returns {Promise<T>}
 */
export async function getOrSetCatalogCache(app, key, loader, { l2TtlSec = 300 } = {}) {
  const l1Hit = app.l1Cache?.get(key);
  if (l1Hit !== undefined) {
    return l1Hit;
  }

  if (app.redis) {
    try {
      const raw = await app.redis.get(key);
      if (typeof raw === 'string' && raw.length > 0) {
        const parsed = JSON.parse(raw);
        app.l1Cache?.set(key, parsed);
        return parsed;
      }
    } catch (err) {
      app.log?.warn?.({ err, key }, 'Catalog L2 Redis cache read failed; falling back to loader');
    }
  }

  const fresh = await loader();
  if (fresh !== null && fresh !== undefined) {
    app.l1Cache?.set(key, fresh);
    if (app.redis) {
      try {
        await app.redis.set(key, JSON.stringify(fresh), 'EX', Math.max(10, l2TtlSec));
      } catch (err) {
        app.log?.warn?.({ err, key }, 'Catalog L2 Redis cache write failed');
      }
    }
  }

  return fresh;
}

/**
 * Invalidate all catalog entries across L1 LRU and L2 Redis using non-blocking SCAN.
 * Mandatory after any Admin Bike, Geometry, Compatibility, Media, or Accessory write.
 * @param {import('fastify').FastifyInstance} app
 * @returns {Promise<void>}
 */
export async function invalidateCatalogCache(app) {
  if (app.l1Cache) {
    for (const key of app.l1Cache.keys()) {
      if (typeof key === 'string' && key.startsWith(CATALOG_CACHE_PREFIX)) {
        app.l1Cache.delete(key);
      }
    }
  }

  if (!app.redis) {
    return;
  }

  try {
    let cursor = '0';
    const keysToDelete = [];
    do {
      const [nextCursor, batch] = await app.redis.scan(
        cursor,
        'MATCH',
        `${CATALOG_CACHE_PREFIX}*`,
        'COUNT',
        100
      );
      cursor = nextCursor;
      if (Array.isArray(batch) && batch.length > 0) {
        keysToDelete.push(...batch);
      }
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await app.redis.del(...keysToDelete);
    }
  } catch (err) {
    app.log?.warn?.({ err }, 'Catalog L2 Redis cache invalidation encountered an error');
  }
}
