/**
 * Find an active (non-deleted) user by normalized email.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function findUserByEmail(prisma, email) {
  return prisma.user.findFirst({
    where: { email, deletedAt: null },
  });
}

/**
 * Find user by ID including saved body profiles.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function findUserWithProfilesById(prisma, userId) {
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
 * Create a new customer user record.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createUser(prisma, data) {
  return prisma.user.create({
    data,
  });
}

/**
 * Update lastLoginAt timestamp for a user.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function touchUserLastLogin(prisma, userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}

/**
 * Insert a hashed RefreshToken record.
 * @param {import('@prisma/client').PrismaClient} prismaOrTx
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createRefreshToken(prismaOrTx, data) {
  return prismaOrTx.refreshToken.create({ data });
}

/**
 * Look up a RefreshToken by HMAC-SHA256 tokenHash including its owning user.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tokenHash
 * @returns {Promise<object|null>}
 */
export async function findRefreshTokenByHash(prisma, tokenHash) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
}

/**
 * Revoke all unrevoked refresh tokens within a rotation family.
 * @param {import('@prisma/client').PrismaClient} prismaOrTx
 * @param {string} familyId
 * @returns {Promise<object>}
 */
export async function revokeTokenFamily(prismaOrTx, familyId) {
  return prismaOrTx.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke all unrevoked refresh tokens belonging to a user.
 * @param {import('@prisma/client').PrismaClient} prismaOrTx
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function revokeAllUserRefreshTokens(prismaOrTx, userId) {
  return prismaOrTx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
