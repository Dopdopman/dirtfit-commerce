import { mapMoneyFieldsToNumbers, toVndBigInt } from '@dirtfit/shared';
import { mapAccessoryRecord } from './accessories.mapper.js';

/**
 * Query active non-deleted accessories for public catalog filtering.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} query
 * @returns {Promise<Array<object>>}
 */
export async function findPublicAccessories(prisma, query) {
  const where = {
    deletedAt: null,
    status: 'ACTIVE',
  };

  if (query.category) {
    where.category = query.category;
  }
  if (query.bikeId) {
    where.compatibilities = {
      some: { bikeId: query.bikeId },
    };
  }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } },
      { brandName: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.accessory.findMany({
    where,
    orderBy: [{ category: 'asc' }, { priceVnd: 'asc' }],
    include: {
      compatibilities: {
        include: {
          bike: {
            include: { brand: true },
          },
        },
      },
    },
  });

  return rows.map(mapAccessoryRecord);
}

/**
 * Fetch an active non-deleted accessory by slug including compatible motorcycles.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function findPublicAccessoryBySlug(prisma, slug) {
  const row = await prisma.accessory.findFirst({
    where: {
      slug,
      deletedAt: null,
      status: 'ACTIVE',
    },
    include: {
      compatibilities: {
        include: {
          bike: {
            include: { brand: true },
          },
        },
      },
    },
  });

  return row ? mapAccessoryRecord(row) : null;
}

/**
 * Query paginated accessories for Admin management.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function findAdminAccessories(prisma, query) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 12;
  const where = {};

  if (!query.includeDeleted) {
    where.deletedAt = null;
  }
  if (query.category) {
    where.category = query.category;
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [totalItems, rows] = await Promise.all([
    prisma.accessory.count({ where }),
    prisma.accessory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map(mapAccessoryRecord),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}

/**
 * Find an accessory by ID (active unless includeDeleted is true).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} id
 * @param {object} [options]
 * @param {boolean} [options.includeDeleted]
 * @returns {Promise<object|null>}
 */
export async function findAccessoryById(prisma, id, { includeDeleted = false } = {}) {
  const row = await prisma.accessory.findFirst({
    where: {
      id,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
  });
  return row ? mapAccessoryRecord(row) : null;
}

/**
 * Create a new accessory inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createAccessory(tx, data) {
  const created = await tx.accessory.create({
    data: {
      sku: data.sku,
      name: data.name,
      slug: data.slug,
      category: data.category,
      brandName: data.brandName ?? null,
      priceVnd: toVndBigInt(data.priceVnd, 'priceVnd'),
      stockQty: data.stockQty,
      status: data.status,
      imageUrl: data.imageUrl ?? null,
      descriptionMd: data.descriptionMd ?? null,
      ergoImpactJson: data.ergoImpactJson ?? undefined,
    },
  });
  return mapAccessoryRecord(created);
}

/**
 * Update an accessory inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateAccessory(tx, id, data) {
  const updateData = { version: { increment: 1 } };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.brandName !== undefined) updateData.brandName = data.brandName;
  if (data.priceVnd !== undefined) updateData.priceVnd = toVndBigInt(data.priceVnd, 'priceVnd');
  if (data.stockQty !== undefined) updateData.stockQty = data.stockQty;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
  if (data.descriptionMd !== undefined) updateData.descriptionMd = data.descriptionMd;
  if (data.ergoImpactJson !== undefined) updateData.ergoImpactJson = data.ergoImpactJson;

  const updated = await tx.accessory.update({
    where: { id },
    data: updateData,
  });
  return mapAccessoryRecord(updated);
}

/**
 * Soft-delete an accessory inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function softDeleteAccessory(tx, id) {
  const updated = await tx.accessory.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: 'DISCONTINUED',
      version: { increment: 1 },
    },
  });
  return mapAccessoryRecord(updated);
}

/**
 * Fetch current compatibility rows for a bike with safe Number installLaborVnd.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} bikeId
 * @returns {Promise<Array<object>>}
 */
export async function findCompatibilitiesByBikeId(prisma, bikeId) {
  const rows = await prisma.bikeAccessoryCompatibility.findMany({
    where: { bikeId },
    orderBy: { accessoryId: 'asc' },
  });
  return rows.map((row) => mapMoneyFieldsToNumbers(row, ['installLaborVnd']));
}

/**
 * Replace the full compatibility matrix for a given bikeId inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {string} bikeId
 * @param {Array<object>} compatibilities
 * @returns {Promise<Array<object>>}
 */
export async function replaceBikeCompatibilities(tx, bikeId, compatibilities) {
  await tx.bikeAccessoryCompatibility.deleteMany({
    where: { bikeId },
  });

  if (compatibilities.length > 0) {
    await tx.bikeAccessoryCompatibility.createMany({
      data: compatibilities.map((item) => ({
        bikeId,
        accessoryId: item.accessoryId,
        exactSeatDropMm: item.exactSeatDropMm ?? null,
        exactForkDropMm: item.exactForkDropMm ?? null,
        requiresWorkshopInstall: Boolean(item.requiresWorkshopInstall),
        installLaborVnd: toVndBigInt(item.installLaborVnd ?? 0, 'installLaborVnd'),
        fitmentNotes: item.fitmentNotes ?? null,
      })),
    });
  }

  return findCompatibilitiesByBikeId(tx, bikeId);
}
