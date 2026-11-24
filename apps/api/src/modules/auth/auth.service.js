import crypto from 'node:crypto';
import { AppError, ERROR_CODES, USER_ROLES } from '@dirtfit/shared';
import { recordAuditLog } from '../audit/audit.service.js';
import {
  generateRawRefreshToken,
  hashPassword,
  hashRefreshToken,
  verifyDummyPassword,
  verifyPassword,
} from './auth.crypto.js';
import {
  createRefreshToken,
  createUser,
  findRefreshTokenByHash,
  findUserByEmail,
  findUserWithProfilesById,
  revokeAllUserRefreshTokens,
  revokeTokenFamily,
  touchUserLastLogin,
} from './auth.repository.js';

/**
 * Project safe public user fields (explicit allowlist; never leaks passwordHash).
 * @param {object} user
 * @returns {object}
 */
export function sanitizeUser(user) {
  const safe = {
    id: user.id,
    email: user.email,
    phone: user.phone ?? null,
    fullName: user.fullName,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };

  if (Array.isArray(user.bodyProfiles)) {
    safe.bodyProfiles = user.bodyProfiles.map((p) => ({
      id: p.id,
      label: p.label,
      heightCm: p.heightCm,
      weightKg: p.weightKg,
      inseamCm: p.inseamCm,
      gender: p.gender,
      bodyProportion: p.bodyProportion,
      footwear: p.footwear,
      gearWeightKg: p.gearWeightKg,
      ridingExperience: p.ridingExperience,
      isDefault: p.isDefault,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  return safe;
}

/**
 * Compute remaining TTL seconds from JWT exp claim for Redis JTI blacklisting.
 * @param {number|null} expEpochSec
 * @returns {number}
 */
function remainingAccessTtlSec(expEpochSec) {
  if (typeof expEpochSec !== 'number') {
    return 900;
  }
  return Math.max(60, Math.ceil(expEpochSec - Date.now() / 1000));
}

/**
 * Issue a signed short-lived JWT access token + opaque refresh token persisted as HMAC-SHA256.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} user
 * @param {object} context
 * @param {string} [familyId]
 * @returns {Promise<{ accessToken: string, rawRefreshToken: string, familyId: string }>}
 */
async function issueSessionTokens(app, user, context, familyId = crypto.randomUUID()) {
  const jti = crypto.randomUUID();
  const accessToken = app.jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
      familyId,
    },
    { expiresIn: app.env.JWT_ACCESS_TTL }
  );

  const rawRefreshToken = generateRawRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken, app.env.REFRESH_TOKEN_PEPPER);
  const expiresAt = new Date(Date.now() + app.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await createRefreshToken(app.prisma, {
    userId: user.id,
    familyId,
    tokenHash,
    expiresAt,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  return { accessToken, rawRefreshToken, familyId };
}

/**
 * Register a new CUSTOMER account and open an authenticated session.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} input
 * @param {object} context
 * @returns {Promise<{ user: object, accessToken: string, rawRefreshToken: string }>}
 */
export async function registerUser(app, input, context) {
  const existing = await findUserByEmail(app.prisma, input.email);
  if (existing) {
    throw new AppError({
      code: ERROR_CODES.CONFLICT,
      status: 409,
      title: 'Email already registered',
      detail: 'An account with this email address already exists.',
    });
  }

  const passwordHash = await hashPassword(input.password);
  const created = await createUser(app.prisma, {
    email: input.email,
    phone: input.phone ?? null,
    fullName: input.fullName,
    passwordHash,
    role: USER_ROLES.CUSTOMER,
  });

  const session = await issueSessionTokens(app, created, context);
  return {
    user: sanitizeUser(created),
    accessToken: session.accessToken,
    rawRefreshToken: session.rawRefreshToken,
  };
}

/**
 * Authenticate a user using constant-time Argon2id verification (with dummy verify on missing user).
 * @param {import('fastify').FastifyInstance} app
 * @param {object} input
 * @param {object} context
 * @returns {Promise<{ user: object, accessToken: string, rawRefreshToken: string }>}
 */
export async function loginUser(app, input, context) {
  const user = await findUserByEmail(app.prisma, input.email);
  if (!user) {
    await verifyDummyPassword(input.password);
    throw new AppError({
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
      title: 'Invalid credentials',
      detail: 'Invalid email or password.',
    });
  }

  const isValid = await verifyPassword(user.passwordHash, input.password);
  if (!isValid || !user.isActive) {
    throw new AppError({
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
      title: 'Invalid credentials',
      detail: 'Invalid email or password.',
    });
  }

  const updatedUser = await touchUserLastLogin(app.prisma, user.id);
  const session = await issueSessionTokens(app, updatedUser, context);
  return {
    user: sanitizeUser(updatedUser),
    accessToken: session.accessToken,
    rawRefreshToken: session.rawRefreshToken,
  };
}

/**
 * Rotate a Refresh Token and detect Reuse Attacks (revoking entire familyId + writing AuditLog).
 * @param {import('fastify').FastifyInstance} app
 * @param {string|undefined} rawRefreshToken
 * @param {object} context
 * @returns {Promise<{ accessToken: string, rawRefreshToken: string }>}
 */
export async function rotateRefreshSession(app, rawRefreshToken, context) {
  if (!rawRefreshToken) {
    throw new AppError({
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
      title: 'Missing refresh token',
      detail: 'Refresh token cookie is required.',
    });
  }

  const tokenHash = hashRefreshToken(rawRefreshToken, app.env.REFRESH_TOKEN_PEPPER);
  const existing = await findRefreshTokenByHash(app.prisma, tokenHash);

  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
      title: 'Invalid refresh token',
      detail: 'Refresh token is invalid or unrecognized.',
    });
  }

  // Reuse Detection: an already revoked or already rotated token was presented again!
  if (existing.revokedAt !== null || existing.replacedByTokenId !== null) {
    await app.prisma.$transaction(async (tx) => {
      await revokeTokenFamily(tx, existing.familyId);
      await recordAuditLog(tx, {
        actorId: existing.userId,
        actorRole: existing.user?.role ?? null,
        action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'RefreshToken',
        entityId: existing.familyId,
        beforeState: {
          reusedTokenId: existing.id,
          revokedAt: existing.revokedAt?.toISOString() ?? null,
          replacedByTokenId: existing.replacedByTokenId,
        },
        afterState: { familyRevoked: true },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      });
    });

    throw new AppError({
      code: ERROR_CODES.REFRESH_TOKEN_REUSED,
      status: 401,
      title: 'Refresh token reuse detected',
      detail: 'Session revoked due to refresh token reuse. Please sign in again.',
    });
  }

  if (existing.expiresAt <= new Date()) {
    await app.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    throw new AppError({
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
      title: 'Refresh token expired',
      detail: 'Refresh token has expired. Please sign in again.',
    });
  }

  if (!existing.user || !existing.user.isActive || existing.user.deletedAt) {
    await revokeTokenFamily(app.prisma, existing.familyId);
    throw new AppError({
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
      title: 'Account unavailable',
      detail: 'User account is disabled or unavailable.',
    });
  }

  const nextRawRefreshToken = generateRawRefreshToken();
  const nextTokenHash = hashRefreshToken(nextRawRefreshToken, app.env.REFRESH_TOKEN_PEPPER);
  const nextExpiresAt = new Date(Date.now() + app.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const rotated = await app.prisma.$transaction(async (tx) => {
    const nextRow = await createRefreshToken(tx, {
      userId: existing.userId,
      familyId: existing.familyId,
      tokenHash: nextTokenHash,
      expiresAt: nextExpiresAt,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    const conditionalRevoke = await tx.refreshToken.updateMany({
      where: {
        id: existing.id,
        revokedAt: null,
        replacedByTokenId: null,
      },
      data: {
        revokedAt: new Date(),
        replacedByTokenId: nextRow.id,
      },
    });

    if (conditionalRevoke.count === 0) {
      await revokeTokenFamily(tx, existing.familyId);
      await recordAuditLog(tx, {
        actorId: existing.userId,
        actorRole: existing.user.role,
        action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'RefreshToken',
        entityId: existing.familyId,
        afterState: { familyRevoked: true, concurrentRace: true },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      });
      return null;
    }

    return nextRow;
  });

  if (!rotated) {
    throw new AppError({
      code: ERROR_CODES.REFRESH_TOKEN_REUSED,
      status: 401,
      title: 'Refresh token reuse detected',
      detail: 'Session revoked due to concurrent token reuse. Please sign in again.',
    });
  }

  const jti = crypto.randomUUID();
  const accessToken = app.jwt.sign(
    {
      sub: existing.user.id,
      email: existing.user.email,
      role: existing.user.role,
      jti,
      familyId: existing.familyId,
    },
    { expiresIn: app.env.JWT_ACCESS_TTL }
  );

  return {
    accessToken,
    rawRefreshToken: nextRawRefreshToken,
  };
}

/**
 * Logout current session: revoke token family in DB and blacklist current Access Token JTI in Redis.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} authUser
 * @param {string|undefined} rawRefreshToken
 * @returns {Promise<void>}
 */
export async function logoutCurrentSession(app, authUser, rawRefreshToken) {
  if (authUser.familyId) {
    await revokeTokenFamily(app.prisma, authUser.familyId);
  } else if (rawRefreshToken) {
    const tokenHash = hashRefreshToken(rawRefreshToken, app.env.REFRESH_TOKEN_PEPPER);
    const existing = await findRefreshTokenByHash(app.prisma, tokenHash);
    if (existing) {
      await revokeTokenFamily(app.prisma, existing.familyId);
    }
  }

  await app.revokeAccessTokenJti(authUser.jti, remainingAccessTtlSec(authUser.exp));
}

/**
 * Logout across all devices: revoke all refresh tokens for user, blacklist current JTI, and audit log.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} authUser
 * @param {object} context
 * @returns {Promise<void>}
 */
export async function logoutAllSessions(app, authUser, context) {
  await app.prisma.$transaction(async (tx) => {
    await revokeAllUserRefreshTokens(tx, authUser.id);
    await recordAuditLog(tx, {
      actorId: authUser.id,
      actorRole: authUser.role,
      action: 'AUTH_LOGOUT_ALL_DEVICES',
      entityType: 'User',
      entityId: authUser.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });
  });

  await app.revokeAccessTokenJti(authUser.jti, remainingAccessTtlSec(authUser.exp));
}

/**
 * Fetch current authenticated user with saved body profiles.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getAuthenticatedMe(app, userId) {
  const user = await findUserWithProfilesById(app.prisma, userId);
  if (!user || !user.isActive) {
    throw new AppError({
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
      title: 'Session invalid',
      detail: 'Authenticated user no longer exists or is inactive.',
    });
  }
  return sanitizeUser(user);
}
