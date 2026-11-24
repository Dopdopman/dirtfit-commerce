/**
 * Find active user profile with body profiles.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function findUserById(prisma, userId) {
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      bodyProfiles: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });
}

/**
 * Update user personal fields.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateUserProfile(prisma, userId, data) {
  return prisma.user.update({
    where: { id: userId },
    data,
    include: {
      bodyProfiles: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });
}

/**
 * List body profiles owned by a user.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function listBodyProfilesByUser(prisma, userId) {
  return prisma.userBodyProfile.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

/**
 * Count body profiles owned by a user.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countBodyProfilesByUser(prisma, userId) {
  return prisma.userBodyProfile.count({ where: { userId } });
}

/**
 * Find single body profile strictly scoped by owner userId (IDOR protection).
 * @param {import('@prisma/client').PrismaClient} prismaOrTx
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function findOwnedBodyProfile(prismaOrTx, id, userId) {
  return prismaOrTx.userBodyProfile.findFirst({
    where: { id, userId },
  });
}

/**
 * List paginated users for Admin portal.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} query
 * @returns {Promise<{ totalItems: number, items: Array<object> }>}
 */
export async function listUsersPaginated(prisma, query) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const where = { deletedAt: null };

  if (query.role) {
    where.role = query.role;
  }
  if (typeof query.isActive === 'boolean') {
    where.isActive = query.isActive;
  }
  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: 'insensitive' } },
      { fullName: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [totalItems, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { totalItems, items };
}
