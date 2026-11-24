import { estimateInseamCm } from '@dirtfit/ergonomics-engine';
import { AppError, ERROR_CODES } from '@dirtfit/shared';
import { recordAuditLog } from '../audit/audit.service.js';
import { sanitizeUser } from '../auth/auth.service.js';
import {
  countBodyProfilesByUser,
  findOwnedBodyProfile,
  findUserById,
  listBodyProfilesByUser,
  listUsersPaginated,
  updateUserProfile,
} from './users.repository.js';

const MAX_BODY_PROFILES_PER_USER = 5;

/**
 * Serialize a UserBodyProfile record for JSON response.
 * @param {object} profile
 * @returns {object}
 */
function serializeBodyProfile(profile) {
  return {
    id: profile.id,
    label: profile.label,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    inseamCm: profile.inseamCm,
    gender: profile.gender,
    bodyProportion: profile.bodyProportion,
    footwear: profile.footwear,
    gearWeightKg: profile.gearWeightKg,
    ridingExperience: profile.ridingExperience,
    isDefault: profile.isDefault,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

/**
 * Get authenticated user's profile.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getMyProfile(prisma, userId) {
  const user = await findUserById(prisma, userId);
  if (!user) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'User not found',
      detail: 'Authenticated user does not exist.',
    });
  }
  return sanitizeUser(user);
}

/**
 * Update authenticated user's basic profile fields.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function updateMyProfile(prisma, userId, input) {
  const updated = await updateUserProfile(prisma, userId, input);
  return sanitizeUser(updated);
}

/**
 * List saved body profiles for the authenticated user.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function getMyBodyProfiles(prisma, userId) {
  const profiles = await listBodyProfilesByUser(prisma, userId);
  return profiles.map(serializeBodyProfile);
}

/**
 * Create a new body profile (max 5/user) and auto-estimate inseam if omitted.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function createMyBodyProfile(prisma, userId, input) {
  const existingCount = await countBodyProfilesByUser(prisma, userId);
  if (existingCount >= MAX_BODY_PROFILES_PER_USER) {
    throw new AppError({
      code: ERROR_CODES.CONFLICT,
      status: 409,
      title: 'Body profile limit reached',
      detail: `Users can save at most ${MAX_BODY_PROFILES_PER_USER} body profiles.`,
    });
  }

  const resolvedInseamCm =
    typeof input.inseamCm === 'number'
      ? input.inseamCm
      : estimateInseamCm({
          heightCm: input.heightCm,
          gender: input.gender,
          bodyProportion: input.bodyProportion,
        });

  const shouldBeDefault = input.isDefault || existingCount === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.userBodyProfile.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.userBodyProfile.create({
      data: {
        userId,
        label: input.label,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        inseamCm: resolvedInseamCm,
        gender: input.gender,
        bodyProportion: input.bodyProportion,
        footwear: input.footwear,
        gearWeightKg: input.gearWeightKg,
        ridingExperience: input.ridingExperience,
        isDefault: shouldBeDefault,
      },
    });
  });

  return serializeBodyProfile(created);
}

/**
 * Update an owned body profile (IDOR-safe).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {string} profileId
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function updateMyBodyProfile(prisma, userId, profileId, input) {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await findOwnedBodyProfile(tx, profileId, userId);
    if (!existing) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        status: 404,
        title: 'Body profile not found',
        detail: 'Requested body profile does not exist.',
      });
    }

    if (input.isDefault === true) {
      await tx.userBodyProfile.updateMany({
        where: { userId, isDefault: true, id: { not: profileId } },
        data: { isDefault: false },
      });
    }

    return tx.userBodyProfile.update({
      where: { id: profileId },
      data: input,
    });
  });

  return serializeBodyProfile(updated);
}

/**
 * Delete an owned body profile (IDOR-safe).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {string} profileId
 * @returns {Promise<void>}
 */
export async function deleteMyBodyProfile(prisma, userId, profileId) {
  const existing = await findOwnedBodyProfile(prisma, profileId, userId);
  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Body profile not found',
      detail: 'Requested body profile does not exist.',
    });
  }

  await prisma.userBodyProfile.delete({ where: { id: profileId } });
}

/**
 * Admin: list users with pagination and filters.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function adminListUsers(prisma, query) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const { totalItems, items } = await listUsersPaginated(prisma, query);

  return {
    items: items.map(sanitizeUser),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}

/**
 * Admin: update user role or active flag and record AuditLog.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} targetUserId
 * @param {object} input
 * @param {object} actorContext
 * @returns {Promise<object>}
 */
export async function adminUpdateUserRole(prisma, targetUserId, input, actorContext) {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
    });

    if (!existing) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        status: 404,
        title: 'User not found',
        detail: 'Target user does not exist.',
      });
    }

    const beforeState = { role: existing.role, isActive: existing.isActive };
    const next = await tx.user.update({
      where: { id: targetUserId },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await recordAuditLog(tx, {
      actorId: actorContext.actorId,
      actorRole: actorContext.actorRole,
      action: 'ADMIN_USER_ROLE_UPDATED',
      entityType: 'User',
      entityId: targetUserId,
      beforeState,
      afterState: { role: next.role, isActive: next.isActive },
      ipAddress: actorContext.ipAddress,
      userAgent: actorContext.userAgent,
      requestId: actorContext.requestId,
    });

    return next;
  });

  return sanitizeUser(updated);
}
