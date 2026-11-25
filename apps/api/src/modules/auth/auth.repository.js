/**
 * Find a user by normalized email. Optionally includes soft-deleted users for OAuth safety checks.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email
 * @param {object} [options]
 * @param {boolean} [options.includeDeleted]
 * @returns {Promise<object|null>}
 */
export async function findUserByEmail(prisma, email, { includeDeleted = false } = {}) {
  return prisma.user.findFirst({
    where: includeDeleted ? { email } : { email, deletedAt: null },
    include: {
      oauthAccounts: {
        orderBy: { linkedAt: 'asc' },
      },
    },
  });
}

/**
 * Find user by ID including saved body profiles and linked OAuth accounts.
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
      oauthAccounts: {
        orderBy: { linkedAt: 'asc' },
      },
    },
  });
}

/**
 * Alias helper matching OAuth ticket exchange queries.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function findUserByIdWithAuth(prisma, userId) {
  return findUserWithProfilesById(prisma, userId);
}

/**
 * Find an OAuthAccount link by provider and immutable providerAccountId (OIDC sub).
 * @param {import('@prisma/client').PrismaClient} prismaOrTx
 * @param {'GOOGLE'} provider
 * @param {string} providerAccountId
 * @returns {Promise<object|null>}
 */
export async function findOAuthAccount(prismaOrTx, provider, providerAccountId) {
  return prismaOrTx.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId,
      },
    },
    include: {
      user: {
        include: {
          bodyProfiles: {
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          },
          oauthAccounts: {
            orderBy: { linkedAt: 'asc' },
          },
        },
      },
    },
  });
}

/**
 * Create a brand-new passwordless OAuth user alongside its OAuthAccount link inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {object} data
 * @returns {Promise<{ user: object, oauthAccount: object }>}
 */
export async function upsertOAuthUser(tx, data) {
  const user = await tx.user.create({
    data: {
      email: data.email,
      fullName: data.fullName,
      passwordHash: null,
      avatarUrl: data.avatarUrl ?? null,
      role: data.role,
      isEmailVerified: true,
      lastLoginAt: new Date(),
    },
  });

  const oauthAccount = await tx.oAuthAccount.create({
    data: {
      userId: user.id,
      provider: data.provider,
      providerAccountId: data.providerAccountId,
      providerEmail: data.providerEmail,
      emailVerified: true,
      avatarUrl: data.avatarUrl ?? null,
      lastUsedAt: new Date(),
    },
  });

  const hydratedUser = await tx.user.findUnique({
    where: { id: user.id },
    include: {
      bodyProfiles: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
      oauthAccounts: {
        orderBy: { linkedAt: 'asc' },
      },
    },
  });

  return { user: hydratedUser, oauthAccount };
}

/**
 * Link a verified OAuth account to an existing user, preserving their existing role.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {object} data
 * @returns {Promise<{ user: object, oauthAccount: object }>}
 */
export async function linkOAuthAccountAndVerifyUser(tx, data) {
  const oauthAccount = await tx.oAuthAccount.create({
    data: {
      userId: data.userId,
      provider: data.provider,
      providerAccountId: data.providerAccountId,
      providerEmail: data.providerEmail,
      emailVerified: true,
      avatarUrl: data.avatarUrl ?? null,
      lastUsedAt: new Date(),
    },
  });

  const user = await tx.user.update({
    where: { id: data.userId },
    data: {
      isEmailVerified: true,
      lastLoginAt: new Date(),
      ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
    },
    include: {
      bodyProfiles: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
      oauthAccounts: {
        orderBy: { linkedAt: 'asc' },
      },
    },
  });

  return { user, oauthAccount };
}

/**
 * Update lastUsedAt and provider email/avatar metadata on repeat OAuth sign-in.
 * @param {import('@prisma/client').PrismaClient} prismaOrTx
 * @param {string} oauthAccountId
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function touchOAuthAccountLastUsed(prismaOrTx, oauthAccountId, data) {
  return prismaOrTx.oAuthAccount.update({
    where: { id: oauthAccountId },
    data: {
      lastUsedAt: new Date(),
      providerEmail: data.providerEmail,
      ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
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
