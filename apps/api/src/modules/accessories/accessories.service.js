import { AppError, ERROR_CODES, USER_ROLES } from '@dirtfit/shared';
import {
  CATALOG_KEYS,
  getOrSetCatalogCache,
  invalidateCatalogCache,
} from '../../common/cache/catalog-cache.js';
import {
  computeAvailableQty,
  getActiveReservedQtyByAccessoryIds,
} from '../../common/inventory/availability.js';
import { recordAuditLog } from '../audit/audit.service.js';
import {
  createAccessory,
  findAccessoryById,
  findAdminAccessories,
  findCompatibilitiesByBikeId,
  findPublicAccessories,
  findPublicAccessoryBySlug,
  replaceBikeCompatibilities,
  softDeleteAccessory,
  updateAccessory,
} from './accessories.repository.js';

const SALES_ALLOWED_ACCESSORY_PATCH_FIELDS = new Set(['stockQty', 'status', 'version']);

/**
 * List public active accessories with live Lazy Expiration availability.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function listPublicAccessories(app, query) {
  const rows = await findPublicAccessories(app.prisma, query);
  const accIds = rows.map((r) => r.id);
  const reservedMap = await getActiveReservedQtyByAccessoryIds(app.prisma, accIds);

  let enriched = rows.map((row) => {
    const activeReservedQty = reservedMap.get(row.id) ?? 0;
    return {
      ...row,
      activeReservedQty,
      availableQty: computeAvailableQty(row.stockQty, activeReservedQty),
    };
  });

  if (query.inStock === true) {
    enriched = enriched.filter((item) => item.availableQty > 0);
  } else if (query.inStock === false) {
    enriched = enriched.filter((item) => item.availableQty === 0);
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 12;
  const totalItems = enriched.length;

  return {
    items: enriched.slice((page - 1) * limit, page * limit),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}

/**
 * Get public accessory detail by slug with caching and live Lazy Expiration availability.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} slug
 * @returns {Promise<object>}
 */
export async function getPublicAccessoryBySlug(app, slug) {
  const cached = await getOrSetCatalogCache(
    app,
    CATALOG_KEYS.accessoryDetail(slug),
    () => findPublicAccessoryBySlug(app.prisma, slug),
    { l2TtlSec: 300 }
  );

  if (!cached) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Accessory not found',
      detail: `No active accessory found with slug "${slug}".`,
    });
  }

  const [freshRow, reservedMap] = await Promise.all([
    app.prisma.accessory.findFirst({
      where: { id: cached.id, deletedAt: null, status: 'ACTIVE' },
      select: { stockQty: true },
    }),
    getActiveReservedQtyByAccessoryIds(app.prisma, [cached.id]),
  ]);

  if (!freshRow) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Accessory not found',
      detail: `Accessory "${slug}" is no longer active.`,
    });
  }

  const activeReservedQty = reservedMap.get(cached.id) ?? 0;
  return {
    ...cached,
    stockQty: freshRow.stockQty,
    activeReservedQty,
    availableQty: computeAvailableQty(freshRow.stockQty, activeReservedQty),
  };
}

/**
 * List accessories for Admin/Sales management.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function adminListAccessories(app, query) {
  const result = await findAdminAccessories(app.prisma, query);
  const accIds = result.items.map((a) => a.id);
  const reservedMap = await getActiveReservedQtyByAccessoryIds(app.prisma, accIds);

  return {
    items: result.items.map((acc) => {
      const activeReservedQty = reservedMap.get(acc.id) ?? 0;
      return {
        ...acc,
        activeReservedQty,
        availableQty: computeAvailableQty(acc.stockQty, activeReservedQty),
      };
    }),
    pagination: result.pagination,
  };
}

/**
 * Create a new accessory (ADMIN only), write AuditLog, and invalidate catalog cache.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function adminCreateAccessory(app, payload, auditCtx) {
  const created = await app.prisma.$transaction(async (tx) => {
    const accessory = await createAccessory(tx, payload);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'ACCESSORY_CREATED',
      entityType: 'Accessory',
      entityId: accessory.id,
      beforeState: null,
      afterState: accessory,
    });
    return accessory;
  });

  await invalidateCatalogCache(app);
  return {
    ...created,
    activeReservedQty: 0,
    availableQty: created.stockQty,
  };
}

/**
 * Update an accessory (ADMIN full; SALES_STAFF stock/status only).
 * @param {import('fastify').FastifyInstance} app
 * @param {string} id
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function adminUpdateAccessory(app, id, payload, auditCtx) {
  if (auditCtx.actorRole !== USER_ROLES.ADMIN) {
    const disallowed = Object.keys(payload).filter(
      (key) => !SALES_ALLOWED_ACCESSORY_PATCH_FIELDS.has(key)
    );
    if (disallowed.length > 0) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        status: 403,
        title: 'Insufficient permissions',
        detail: `Role ${auditCtx.actorRole} can only update stockQty or status on accessories.`,
      });
    }
  }

  const existing = await findAccessoryById(app.prisma, id);
  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Accessory not found',
      detail: `Accessory ${id} does not exist.`,
    });
  }

  if (payload.version !== undefined && payload.version !== existing.version) {
    throw new AppError({
      code: ERROR_CODES.CONFLICT,
      status: 409,
      title: 'Version conflict',
      detail: 'Accessory record was modified concurrently. Please reload and retry.',
    });
  }

  const updated = await app.prisma.$transaction(async (tx) => {
    const row = await updateAccessory(tx, id, payload);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'ACCESSORY_UPDATED',
      entityType: 'Accessory',
      entityId: row.id,
      beforeState: {
        priceVnd: existing.priceVnd,
        stockQty: existing.stockQty,
        status: existing.status,
        ergoImpactJson: existing.ergoImpactJson,
      },
      afterState: {
        priceVnd: row.priceVnd,
        stockQty: row.stockQty,
        status: row.status,
        ergoImpactJson: row.ergoImpactJson,
      },
    });
    return row;
  });

  await invalidateCatalogCache(app);
  const reservedMap = await getActiveReservedQtyByAccessoryIds(app.prisma, [updated.id]);
  const activeReservedQty = reservedMap.get(updated.id) ?? 0;

  return {
    ...updated,
    activeReservedQty,
    availableQty: computeAvailableQty(updated.stockQty, activeReservedQty),
  };
}

/**
 * Soft-delete an accessory, record AuditLog, and invalidate catalog cache.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} id
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function adminSoftDeleteAccessory(app, id, auditCtx) {
  const existing = await findAccessoryById(app.prisma, id);
  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Accessory not found',
      detail: `Accessory ${id} does not exist.`,
    });
  }

  const deleted = await app.prisma.$transaction(async (tx) => {
    const row = await softDeleteAccessory(tx, id);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'ACCESSORY_SOFT_DELETED',
      entityType: 'Accessory',
      entityId: row.id,
      beforeState: { status: existing.status, deletedAt: existing.deletedAt },
      afterState: { status: row.status, deletedAt: row.deletedAt },
    });
    return row;
  });

  await invalidateCatalogCache(app);
  return deleted;
}

/**
 * Replace a motorcycle's compatibility matrix with AuditLog and cache invalidation.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} bikeId
 * @param {Array<object>} compatibilities
 * @param {object} auditCtx
 * @returns {Promise<Array<object>>}
 */
export async function adminPutBikeCompatibilities(app, bikeId, compatibilities, auditCtx) {
  const bike = await app.prisma.bike.findFirst({
    where: { id: bikeId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!bike) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Motorcycle ${bikeId} does not exist.`,
    });
  }

  const accessoryIds = Array.from(new Set(compatibilities.map((c) => c.accessoryId)));
  if (accessoryIds.length !== compatibilities.length) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      status: 400,
      title: 'Duplicate accessory in compatibility matrix',
      detail: 'Each accessoryId can appear at most once per motorcycle.',
    });
  }

  if (accessoryIds.length > 0) {
    const foundCount = await app.prisma.accessory.count({
      where: {
        id: { in: accessoryIds },
        deletedAt: null,
      },
    });
    if (foundCount !== accessoryIds.length) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        status: 404,
        title: 'Referenced accessory not found',
        detail: 'One or more accessoryId values do not exist or were soft-deleted.',
      });
    }
  }

  const before = await findCompatibilitiesByBikeId(app.prisma, bikeId);
  const after = await app.prisma.$transaction(async (tx) => {
    const rows = await replaceBikeCompatibilities(tx, bikeId, compatibilities);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'BIKE_COMPATIBILITIES_REPLACED',
      entityType: 'Bike',
      entityId: bikeId,
      beforeState: { count: before.length, compatibilities: before },
      afterState: { count: rows.length, compatibilities: rows },
    });
    return rows;
  });

  await invalidateCatalogCache(app);
  return after;
}
