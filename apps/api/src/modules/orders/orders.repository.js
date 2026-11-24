import { mapOrderRecord } from './orders.mapper.js';

export const ORDER_FULL_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  reservations: { orderBy: { createdAt: 'asc' } },
  transactions: { orderBy: { createdAt: 'desc' } },
  user: { select: { id: true, email: true, fullName: true, phone: true } },
};

/**
 * Fetch an Order with all items, reservations, transactions, and customer summary.
 * @param {import('@prisma/client').PrismaClient} prismaOrTx
 * @param {string} orderId
 * @returns {Promise<object|null>}
 */
export async function findOrderById(prismaOrTx, orderId) {
  const row = await prismaOrTx.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: ORDER_FULL_INCLUDE,
  });
  return row ? mapOrderRecord(row) : null;
}

/**
 * Query paginated orders for either a single customer or Admin/Sales portal.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} query
 * @param {string} [scopedUserId]
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function findOrdersPaginated(prisma, query, scopedUserId = undefined) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 12;
  const where = { deletedAt: null };

  if (scopedUserId) {
    where.userId = scopedUserId;
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.orderType) {
    where.orderType = query.orderType;
  }
  if (query.orderNumber) {
    where.orderNumber = { contains: query.orderNumber, mode: 'insensitive' };
  }

  const [totalItems, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: ORDER_FULL_INCLUDE,
    }),
  ]);

  return {
    items: rows.map(mapOrderRecord),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}
