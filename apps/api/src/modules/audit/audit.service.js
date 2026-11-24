/**
 * Write an immutable AuditLog record using the provided Prisma client or transaction.
 * @param {import('@prisma/client').PrismaClient} prismaOrTx
 * @param {object} entry
 * @param {string|null} [entry.actorId]
 * @param {string|null} [entry.actorRole]
 * @param {string} entry.action
 * @param {string} entry.entityType
 * @param {string} entry.entityId
 * @param {object|null} [entry.beforeState]
 * @param {object|null} [entry.afterState]
 * @param {string|null} [entry.ipAddress]
 * @param {string|null} [entry.userAgent]
 * @param {string|null} [entry.requestId]
 * @returns {Promise<object>}
 */
export async function recordAuditLog(prismaOrTx, entry) {
  return prismaOrTx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: String(entry.entityId),
      beforeState: entry.beforeState ?? undefined,
      afterState: entry.afterState ?? undefined,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
    },
  });
}

/**
 * Query paginated audit logs for Admin review.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function listAuditLogs(prisma, query) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const where = {};

  if (query.action) {
    where.action = query.action;
  }
  if (query.entityType) {
    where.entityType = query.entityType;
  }
  if (query.actorId) {
    where.actorId = query.actorId;
  }

  const [totalItems, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        actor: {
          select: { id: true, email: true, fullName: true, role: true },
        },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}
