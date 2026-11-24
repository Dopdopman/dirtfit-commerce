/**
 * Compute live active non-expired reserved quantities per bikeId (Lazy Expiration).
 * Ignores ACTIVE reservations whose expiresAt < NOW().
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} bikeIds
 * @returns {Promise<Map<string, number>>}
 */
export async function getActiveReservedQtyByBikeIds(prisma, bikeIds) {
  const result = new Map();
  if (!Array.isArray(bikeIds) || bikeIds.length === 0) {
    return result;
  }

  const rows = await prisma.inventoryReservation.groupBy({
    by: ['bikeId'],
    where: {
      itemType: 'BIKE',
      bikeId: { in: bikeIds },
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    _sum: { quantity: true },
  });

  for (const row of rows) {
    if (row.bikeId) {
      result.set(row.bikeId, Number(row._sum?.quantity ?? 0));
    }
  }
  return result;
}

/**
 * Compute live active non-expired reserved quantities per accessoryId (Lazy Expiration).
 * Ignores ACTIVE reservations whose expiresAt < NOW().
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} accessoryIds
 * @returns {Promise<Map<string, number>>}
 */
export async function getActiveReservedQtyByAccessoryIds(prisma, accessoryIds) {
  const result = new Map();
  if (!Array.isArray(accessoryIds) || accessoryIds.length === 0) {
    return result;
  }

  const rows = await prisma.inventoryReservation.groupBy({
    by: ['accessoryId'],
    where: {
      itemType: 'ACCESSORY',
      accessoryId: { in: accessoryIds },
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    _sum: { quantity: true },
  });

  for (const row of rows) {
    if (row.accessoryId) {
      result.set(row.accessoryId, Number(row._sum?.quantity ?? 0));
    }
  }
  return result;
}

/**
 * Derive non-negative sellable quantity from physical stock minus active unexpired holds.
 * @param {number} stockQty
 * @param {number} [activeReservedQty]
 * @returns {number}
 */
export function computeAvailableQty(stockQty, activeReservedQty = 0) {
  return Math.max(0, Number(stockQty ?? 0) - Number(activeReservedQty ?? 0));
}
