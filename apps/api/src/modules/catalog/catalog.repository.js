import { toVndBigInt } from '@dirtfit/shared';
import { mapBikeMedia, mapBikeRecord, mapBrand } from './catalog.mapper.js';

const ACTIVE_BIKE_INCLUDE = {
  brand: true,
  geometrySpec: true,
  media: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  compatibilities: {
    where: {
      accessory: {
        deletedAt: null,
        status: 'ACTIVE',
      },
    },
    include: {
      accessory: true,
    },
  },
};

/**
 * List all motorcycle brands ordered alphabetically.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<Array<object>>}
 */
export async function findAllBrands(prisma) {
  const rows = await prisma.brand.findMany({
    orderBy: { name: 'asc' },
  });
  return rows.map(mapBrand);
}

/**
 * Load all active non-deleted bikes with geometry, media, and active compatibilities for caching.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<Array<object>>}
 */
export async function findActiveBikesProjection(prisma) {
  const rows = await prisma.bike.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
    },
    orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    include: ACTIVE_BIKE_INCLUDE,
  });

  return rows.map(mapBikeRecord);
}

/**
 * Fetch current stockQty for active bikes to combine with Lazy Expiration reservations.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} bikeIds
 * @returns {Promise<Map<string, number>>}
 */
export async function findBikeStockMapByIds(prisma, bikeIds) {
  const result = new Map();
  if (!Array.isArray(bikeIds) || bikeIds.length === 0) {
    return result;
  }

  const rows = await prisma.bike.findMany({
    where: { id: { in: bikeIds }, deletedAt: null },
    select: { id: true, stockQty: true },
  });

  for (const row of rows) {
    result.set(row.id, row.stockQty);
  }
  return result;
}

/**
 * Fetch an active non-deleted bike by slug.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function findActiveBikeBySlug(prisma, slug) {
  const row = await prisma.bike.findFirst({
    where: {
      slug,
      deletedAt: null,
      status: 'ACTIVE',
    },
    include: ACTIVE_BIKE_INCLUDE,
  });

  return row ? mapBikeRecord(row) : null;
}

/**
 * Fetch an active non-deleted bike by either UUID id or slug.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} ref
 * @param {string} [ref.bikeId]
 * @param {string} [ref.slug]
 * @returns {Promise<object|null>}
 */
export async function findActiveBikeByIdOrSlug(prisma, { bikeId, slug }) {
  const row = await prisma.bike.findFirst({
    where: {
      ...(bikeId ? { id: bikeId } : { slug }),
      deletedAt: null,
      status: 'ACTIVE',
    },
    include: ACTIVE_BIKE_INCLUDE,
  });

  return row ? mapBikeRecord(row) : null;
}

/**
 * Fetch bike by ID for Admin CRUD (includes deleted if requested).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} id
 * @param {object} [options]
 * @param {boolean} [options.includeDeleted]
 * @returns {Promise<object|null>}
 */
export async function findBikeById(prisma, id, { includeDeleted = false } = {}) {
  const row = await prisma.bike.findFirst({
    where: {
      id,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    include: {
      brand: true,
      geometrySpec: true,
      media: {
        where: { deletedAt: null },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      },
      compatibilities: {
        include: { accessory: true },
      },
    },
  });

  return row ? mapBikeRecord(row) : null;
}

/**
 * Query paginated bikes for Admin portal.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function findAdminBikes(prisma, query) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 12;
  const where = {};

  if (!query.includeDeleted) {
    where.deletedAt = null;
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.category) {
    where.category = query.category;
  }
  if (query.ridingFocus) {
    where.ridingFocus = query.ridingFocus;
  }
  if (query.brandSlug) {
    where.brand = { slug: query.brandSlug };
  }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [totalItems, rows] = await Promise.all([
    prisma.bike.count({ where }),
    prisma.bike.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        brand: true,
        geometrySpec: true,
        media: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        },
      },
    }),
  ]);

  return {
    items: rows.map(mapBikeRecord),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}

/**
 * Create a new Bike + BikeGeometrySpec inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createBikeWithGeometry(tx, data) {
  const created = await tx.bike.create({
    data: {
      brandId: data.brandId,
      sku: data.sku,
      name: data.name,
      slug: data.slug,
      modelYear: data.modelYear,
      category: data.category,
      ridingFocus: data.ridingFocus,
      engineCc: data.engineCc,
      streetLegal: data.streetLegal,
      priceVnd: toVndBigInt(data.priceVnd, 'priceVnd'),
      depositAmountVnd: toVndBigInt(data.depositAmountVnd, 'depositAmountVnd'),
      stockQty: data.stockQty,
      status: data.status,
      shortSummary: data.shortSummary ?? null,
      descriptionMd: data.descriptionMd ?? null,
      geometrySpec: {
        create: data.geometrySpec,
      },
    },
    include: ACTIVE_BIKE_INCLUDE,
  });

  return mapBikeRecord(created);
}

/**
 * Update a Bike and optional BikeGeometrySpec with version increment.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateBikeWithGeometry(tx, id, data) {
  const { geometrySpec, version: _expectedVersion, ...bikeFields } = data;
  const updateData = {
    version: { increment: 1 },
  };

  if (bikeFields.brandId !== undefined) updateData.brandId = bikeFields.brandId;
  if (bikeFields.name !== undefined) updateData.name = bikeFields.name;
  if (bikeFields.modelYear !== undefined) updateData.modelYear = bikeFields.modelYear;
  if (bikeFields.category !== undefined) updateData.category = bikeFields.category;
  if (bikeFields.ridingFocus !== undefined) updateData.ridingFocus = bikeFields.ridingFocus;
  if (bikeFields.engineCc !== undefined) updateData.engineCc = bikeFields.engineCc;
  if (bikeFields.streetLegal !== undefined) updateData.streetLegal = bikeFields.streetLegal;
  if (bikeFields.priceVnd !== undefined) {
    updateData.priceVnd = toVndBigInt(bikeFields.priceVnd, 'priceVnd');
  }
  if (bikeFields.depositAmountVnd !== undefined) {
    updateData.depositAmountVnd = toVndBigInt(bikeFields.depositAmountVnd, 'depositAmountVnd');
  }
  if (bikeFields.stockQty !== undefined) updateData.stockQty = bikeFields.stockQty;
  if (bikeFields.status !== undefined) updateData.status = bikeFields.status;
  if (bikeFields.shortSummary !== undefined) updateData.shortSummary = bikeFields.shortSummary;
  if (bikeFields.descriptionMd !== undefined) updateData.descriptionMd = bikeFields.descriptionMd;

  if (geometrySpec && Object.keys(geometrySpec).length > 0) {
    updateData.geometrySpec = {
      update: geometrySpec,
    };
  }

  const updated = await tx.bike.update({
    where: { id },
    data: updateData,
    include: ACTIVE_BIKE_INCLUDE,
  });

  return mapBikeRecord(updated);
}

/**
 * Soft-delete a bike inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function softDeleteBike(tx, id) {
  const updated = await tx.bike.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: 'DISCONTINUED',
      version: { increment: 1 },
    },
    include: {
      brand: true,
      geometrySpec: true,
    },
  });

  return mapBikeRecord(updated);
}

/**
 * Find non-deleted BikeMedia belonging to a bike.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} bikeId
 * @param {string} mediaId
 * @returns {Promise<object|null>}
 */
export async function findBikeMediaById(prisma, bikeId, mediaId) {
  const row = await prisma.bikeMedia.findFirst({
    where: {
      id: mediaId,
      bikeId,
      deletedAt: null,
    },
  });
  return row ? mapBikeMedia(row) : null;
}

/**
 * Save validated UV calibrationData to BikeMedia inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {string} mediaId
 * @param {object} calibrationData
 * @returns {Promise<object>}
 */
export async function updateBikeMediaCalibration(tx, mediaId, calibrationData) {
  const updated = await tx.bikeMedia.update({
    where: { id: mediaId },
    data: { calibrationData },
  });
  return mapBikeMedia(updated);
}
