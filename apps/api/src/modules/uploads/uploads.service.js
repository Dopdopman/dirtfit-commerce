import {
  AppError,
  ERROR_CODES,
  MAX_MEDIA_UPLOAD_BYTES,
  MEDIA_TYPES,
  isCommercialPhotoType,
  isLiveImageUrl,
} from '@dirtfit/shared';
import { invalidateCatalogCache } from '../../common/cache/catalog-cache.js';
import {
  buildSafeAccessoryStorageKey,
  buildSafeBikeStorageKey,
  validateAnySafeStorageKey,
  validateSafeAccessoryStorageKey,
  validateSafeBikeStorageKey,
  verifyUploadedImageHeader,
} from '../../common/storage/magic-bytes.js';
import { mapAccessoryRecord } from '../accessories/accessories.mapper.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { mapBikeMedia } from '../catalog/catalog.mapper.js';

/**
 * Validate uploaded object size (<= 5MB) and 4KB Magic Bytes, deleting invalid/spoofed objects.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} params
 * @param {string} params.storageKey
 * @param {string} params.declaredMimeType
 * @param {string} params.entityType
 * @param {string} params.entityId
 * @param {object} params.auditCtx
 * @returns {Promise<{ sizeBytes: number, detectedMime: string }>}
 */
async function verifyStoredUploadOrPurge(
  app,
  { storageKey, declaredMimeType, entityType, entityId, auditCtx }
) {
  const headMeta = await app.storage.headObject(storageKey);
  if (headMeta.sizeBytes > MAX_MEDIA_UPLOAD_BYTES) {
    await safeDeleteObjectBestEffort(app, storageKey);
    throw new AppError({
      code: ERROR_CODES.INVALID_UPLOAD_FILE,
      status: 422,
      title: 'Uploaded file exceeds maximum allowed size',
      detail: `Uploaded object (${headMeta.sizeBytes} bytes) exceeds max limit of ${MAX_MEDIA_UPLOAD_BYTES} bytes.`,
    });
  }

  const headBytes = await app.storage.readHeadBytes(storageKey, 4096);
  const check = verifyUploadedImageHeader(headBytes, declaredMimeType);

  if (!check.valid) {
    await safeDeleteObjectBestEffort(app, storageKey);
    await recordAuditLog(app.prisma, {
      ...auditCtx,
      action: 'MEDIA_UPLOAD_REJECTED',
      entityType,
      entityId,
      beforeState: null,
      afterState: {
        storageKey,
        declaredMimeType,
        detectedMime: check.detectedMime,
        reason: check.reason,
      },
    });

    throw new AppError({
      code: ERROR_CODES.INVALID_UPLOAD_FILE,
      status: 422,
      title: 'Uploaded file failed Magic Bytes security check',
      detail: check.reason,
    });
  }

  return {
    sizeBytes: headMeta.sizeBytes,
    detectedMime: check.detectedMime,
  };
}

/**
 * Best-effort object deletion for R2 / local storage without aborting committed DB state.
 * @param {import('fastify').FastifyInstance} app
 * @param {string|null|undefined} storageKey
 */
async function safeDeleteObjectBestEffort(app, storageKey) {
  if (!storageKey || !validateAnySafeStorageKey(storageKey)) {
    return;
  }
  try {
    await app.storage.deleteObject(storageKey);
  } catch (err) {
    app.log?.warn?.({ err, storageKey }, 'Best-effort storage object deletion failed');
  }
}

/**
 * Generate a restricted presigned upload grant for JPEG/PNG/WebP bike media (<= 5MB).
 * @param {import('fastify').FastifyInstance} app
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createMediaPresign(app, payload) {
  const bike = await app.prisma.bike.findFirst({
    where: { id: payload.bikeId, deletedAt: null },
    select: { id: true, name: true },
  });

  if (!bike) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Active motorcycle ${payload.bikeId} does not exist.`,
    });
  }

  const mediaType = payload.mediaType ?? MEDIA_TYPES.GALLERY;
  const storageKey = buildSafeBikeStorageKey(payload.bikeId, mediaType, payload.mimeType);
  const presigned = await app.storage.createPresignedUpload({
    storageKey,
    mimeType: payload.mimeType,
    sizeBytes: payload.sizeBytes,
    expiresInSeconds: 300,
  });

  return {
    bikeId: bike.id,
    mediaType,
    mimeType: payload.mimeType,
    maxSizeBytes: MAX_MEDIA_UPLOAD_BYTES,
    driver: app.storage.driver,
    ...presigned,
  };
}

/**
 * Confirm an uploaded bike media object via 4KB Magic Bytes verification, transactional primary enforcement,
 * AuditLog recording, and catalog cache invalidation.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<{ media: object, verifiedMime: string }>}
 */
export async function confirmMediaUpload(app, payload, auditCtx) {
  if (!validateSafeBikeStorageKey(payload.storageKey, payload.bikeId)) {
    throw new AppError({
      code: ERROR_CODES.INVALID_UPLOAD_FILE,
      status: 400,
      title: 'Invalid storageKey format',
      detail: 'storageKey does not match expected bike UUID media key format.',
    });
  }

  const bike = await app.prisma.bike.findFirst({
    where: { id: payload.bikeId, deletedAt: null },
    select: { id: true },
  });

  if (!bike) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Active motorcycle ${payload.bikeId} does not exist.`,
    });
  }

  const { sizeBytes, detectedMime } = await verifyStoredUploadOrPurge(app, {
    storageKey: payload.storageKey,
    declaredMimeType: payload.declaredMimeType,
    entityType: 'Bike',
    entityId: payload.bikeId,
    auditCtx,
  });

  const publicUrl = app.storage.getPublicUrl(payload.storageKey);
  const mediaType = payload.mediaType ?? MEDIA_TYPES.GALLERY;

  const created = await app.prisma.$transaction(async (tx) => {
    let effectiveIsPrimary = Boolean(payload.isPrimary);

    if (mediaType === MEDIA_TYPES.SIDE_PROFILE_BLUEPRINT) {
      if (effectiveIsPrimary) {
        await tx.bikeMedia.updateMany({
          where: {
            bikeId: payload.bikeId,
            mediaType: MEDIA_TYPES.SIDE_PROFILE_BLUEPRINT,
            isPrimary: true,
            deletedAt: null,
          },
          data: { isPrimary: false },
        });
      }
    } else if (isCommercialPhotoType(mediaType)) {
      const existingCommercial = await tx.bikeMedia.findMany({
        where: {
          bikeId: payload.bikeId,
          mediaType: { in: [MEDIA_TYPES.HERO, MEDIA_TYPES.GALLERY] },
          deletedAt: null,
        },
        select: { id: true, url: true, isPrimary: true },
      });

      const hasLivePrimaryPhoto = existingCommercial.some(
        (item) => item.isPrimary && isLiveImageUrl(item.url)
      );
      effectiveIsPrimary = Boolean(payload.isPrimary) || !hasLivePrimaryPhoto;

      if (effectiveIsPrimary) {
        await tx.bikeMedia.updateMany({
          where: {
            bikeId: payload.bikeId,
            mediaType: { in: [MEDIA_TYPES.HERO, MEDIA_TYPES.GALLERY] },
            isPrimary: true,
            deletedAt: null,
          },
          data: { isPrimary: false },
        });
      }
    } else {
      effectiveIsPrimary = false;
    }

    const row = await tx.bikeMedia.create({
      data: {
        bikeId: payload.bikeId,
        url: publicUrl,
        storageKey: payload.storageKey,
        mediaType,
        altText: payload.altText ?? null,
        widthPx: payload.widthPx ?? null,
        heightPx: payload.heightPx ?? null,
        isPrimary: effectiveIsPrimary,
        sortOrder: payload.sortOrder ?? 0,
      },
    });

    const mapped = mapBikeMedia(row);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'BIKE_MEDIA_CREATED',
      entityType: 'BikeMedia',
      entityId: row.id,
      beforeState: null,
      afterState: {
        ...mapped,
        verifiedMime: detectedMime,
        sizeBytes,
      },
    });

    return mapped;
  });

  await invalidateCatalogCache(app);

  return {
    media: created,
    verifiedMime: detectedMime,
  };
}

/**
 * Promote an active BikeMedia asset as the primary Cover Photo (HERO/GALLERY)
 * or primary 2D Blueprint (SIDE_PROFILE_BLUEPRINT) without cross-domain side effects.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} bikeId
 * @param {string} mediaId
 * @param {object} auditCtx
 * @returns {Promise<{ media: object }>}
 */
export async function setBikePrimaryMedia(app, bikeId, mediaId, auditCtx) {
  const existing = await app.prisma.bikeMedia.findFirst({
    where: {
      id: mediaId,
      bikeId,
      deletedAt: null,
      bike: { deletedAt: null },
    },
  });

  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Bike media not found',
      detail: `Active media ${mediaId} does not exist on motorcycle ${bikeId}.`,
    });
  }

  if (existing.mediaType === MEDIA_TYPES.SPEC_SHEET) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      status: 400,
      title: 'Unsupported primary media type',
      detail: 'SPEC_SHEET assets cannot be marked as primary storefront cover.',
    });
  }

  const domainFilter = isCommercialPhotoType(existing.mediaType)
    ? { in: [MEDIA_TYPES.HERO, MEDIA_TYPES.GALLERY] }
    : MEDIA_TYPES.SIDE_PROFILE_BLUEPRINT;

  const updated = await app.prisma.$transaction(async (tx) => {
    await tx.bikeMedia.updateMany({
      where: {
        bikeId,
        mediaType: domainFilter,
        isPrimary: true,
        deletedAt: null,
        id: { not: mediaId },
      },
      data: { isPrimary: false },
    });

    const row = await tx.bikeMedia.update({
      where: { id: mediaId },
      data: { isPrimary: true },
    });

    const mapped = mapBikeMedia(row);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'BIKE_MEDIA_PRIMARY_CHANGED',
      entityType: 'BikeMedia',
      entityId: row.id,
      beforeState: { isPrimary: existing.isPrimary, mediaType: existing.mediaType },
      afterState: { isPrimary: true, mediaType: row.mediaType, url: row.url },
    });

    return mapped;
  });

  await invalidateCatalogCache(app);
  return { media: updated };
}

/**
 * Reorder active BikeMedia assets for a motorcycle in one atomic transaction.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} bikeId
 * @param {string[]} orderedMediaIds
 * @param {object} auditCtx
 * @returns {Promise<{ media: Array<object> }>}
 */
export async function reorderBikeMedia(app, bikeId, orderedMediaIds, auditCtx) {
  const uniqueIds = new Set(orderedMediaIds);
  if (uniqueIds.size !== orderedMediaIds.length) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      status: 400,
      title: 'Duplicate media IDs',
      detail: 'orderedMediaIds must not contain duplicate UUID entries.',
    });
  }

  const bike = await app.prisma.bike.findFirst({
    where: { id: bikeId, deletedAt: null },
    select: { id: true },
  });
  if (!bike) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Active motorcycle ${bikeId} does not exist.`,
    });
  }

  const existingRows = await app.prisma.bikeMedia.findMany({
    where: {
      id: { in: orderedMediaIds },
      bikeId,
      deletedAt: null,
    },
    select: { id: true, sortOrder: true },
  });

  if (existingRows.length !== orderedMediaIds.length) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Media asset not found',
      detail: 'One or more media IDs do not belong to this motorcycle or were deleted.',
    });
  }

  const media = await app.prisma.$transaction(async (tx) => {
    for (let idx = 0; idx < orderedMediaIds.length; idx += 1) {
      await tx.bikeMedia.update({
        where: { id: orderedMediaIds[idx] },
        data: { sortOrder: idx },
      });
    }

    const updatedRows = await tx.bikeMedia.findMany({
      where: { bikeId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'BIKE_MEDIA_REORDERED',
      entityType: 'Bike',
      entityId: bikeId,
      beforeState: existingRows,
      afterState: orderedMediaIds.map((id, sortOrder) => ({ id, sortOrder })),
    });

    return updatedRows.map(mapBikeMedia);
  });

  await invalidateCatalogCache(app);
  return { media };
}

/**
 * Soft-delete a BikeMedia asset, auto-promote the next commercial photo if cover was deleted,
 * remove uploaded R2/local object best-effort, write AuditLog, and invalidate catalog cache.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} bikeId
 * @param {string} mediaId
 * @param {object} auditCtx
 * @returns {Promise<{ deletedMediaId: string, promotedCoverMediaId: string|null }>}
 */
export async function deleteBikeMedia(app, bikeId, mediaId, auditCtx) {
  const existing = await app.prisma.bikeMedia.findFirst({
    where: {
      id: mediaId,
      bikeId,
      deletedAt: null,
      bike: { deletedAt: null },
    },
  });

  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Bike media not found',
      detail: `Active media ${mediaId} does not exist on motorcycle ${bikeId}.`,
    });
  }

  const promotedCoverMediaId = await app.prisma.$transaction(async (tx) => {
    await tx.bikeMedia.update({
      where: { id: mediaId },
      data: { deletedAt: new Date(), isPrimary: false },
    });

    let promotedId = null;
    if (existing.isPrimary && isCommercialPhotoType(existing.mediaType)) {
      const remaining = await tx.bikeMedia.findMany({
        where: {
          bikeId,
          mediaType: { in: [MEDIA_TYPES.HERO, MEDIA_TYPES.GALLERY] },
          deletedAt: null,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      const nextCover = remaining.find((row) => isLiveImageUrl(row.url)) ?? remaining[0] ?? null;
      if (nextCover) {
        await tx.bikeMedia.update({
          where: { id: nextCover.id },
          data: { isPrimary: true },
        });
        promotedId = nextCover.id;
      }
    }

    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'BIKE_MEDIA_DELETED',
      entityType: 'BikeMedia',
      entityId: mediaId,
      beforeState: mapBikeMedia(existing),
      afterState: { deleted: true, promotedCoverMediaId: promotedId },
    });

    return promotedId;
  });

  await safeDeleteObjectBestEffort(app, existing.storageKey);
  await invalidateCatalogCache(app);

  return {
    deletedMediaId: mediaId,
    promotedCoverMediaId,
  };
}

/**
 * Generate a restricted presigned upload grant for an accessory product photo (<= 5MB).
 * @param {import('fastify').FastifyInstance} app
 * @param {string} accessoryId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createAccessoryMediaPresign(app, accessoryId, payload) {
  const accessory = await app.prisma.accessory.findFirst({
    where: { id: accessoryId, deletedAt: null },
    select: { id: true, name: true, sku: true },
  });

  if (!accessory) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Accessory not found',
      detail: `Active accessory ${accessoryId} does not exist.`,
    });
  }

  const storageKey = buildSafeAccessoryStorageKey(accessoryId, payload.mimeType);
  const presigned = await app.storage.createPresignedUpload({
    storageKey,
    mimeType: payload.mimeType,
    sizeBytes: payload.sizeBytes,
    expiresInSeconds: 300,
  });

  return {
    accessoryId: accessory.id,
    mimeType: payload.mimeType,
    maxSizeBytes: MAX_MEDIA_UPLOAD_BYTES,
    driver: app.storage.driver,
    ...presigned,
  };
}

/**
 * Confirm an accessory photo via 4KB Magic Bytes check, update Accessory.imageUrl/imageStorageKey,
 * remove previous R2/local object best-effort, record AuditLog, and invalidate catalog cache.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} accessoryId
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<{ accessory: object, verifiedMime: string }>}
 */
export async function confirmAccessoryMediaUpload(app, accessoryId, payload, auditCtx) {
  if (!validateSafeAccessoryStorageKey(payload.storageKey, accessoryId)) {
    throw new AppError({
      code: ERROR_CODES.INVALID_UPLOAD_FILE,
      status: 400,
      title: 'Invalid storageKey format',
      detail: 'storageKey does not match expected accessory UUID media key format.',
    });
  }

  const existing = await app.prisma.accessory.findFirst({
    where: { id: accessoryId, deletedAt: null },
  });

  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Accessory not found',
      detail: `Active accessory ${accessoryId} does not exist.`,
    });
  }

  const { sizeBytes, detectedMime } = await verifyStoredUploadOrPurge(app, {
    storageKey: payload.storageKey,
    declaredMimeType: payload.declaredMimeType,
    entityType: 'Accessory',
    entityId: accessoryId,
    auditCtx,
  });

  const publicUrl = app.storage.getPublicUrl(payload.storageKey);
  const previousStorageKey = existing.imageStorageKey;

  const updated = await app.prisma.$transaction(async (tx) => {
    const row = await tx.accessory.update({
      where: { id: accessoryId },
      data: {
        imageUrl: publicUrl,
        imageStorageKey: payload.storageKey,
        version: { increment: 1 },
      },
    });

    const mapped = mapAccessoryRecord(row);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'ACCESSORY_MEDIA_UPDATED',
      entityType: 'Accessory',
      entityId: accessoryId,
      beforeState: {
        imageUrl: existing.imageUrl ?? null,
        imageStorageKey: previousStorageKey ?? null,
      },
      afterState: {
        imageUrl: mapped.imageUrl,
        imageStorageKey: mapped.imageStorageKey,
        verifiedMime: detectedMime,
        sizeBytes,
      },
    });

    return mapped;
  });

  if (previousStorageKey && previousStorageKey !== payload.storageKey) {
    await safeDeleteObjectBestEffort(app, previousStorageKey);
  }
  await invalidateCatalogCache(app);

  return {
    accessory: updated,
    verifiedMime: detectedMime,
  };
}

/**
 * Remove an accessory's photo reference, clean up storage object best-effort,
 * record AuditLog, and invalidate catalog cache.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} accessoryId
 * @param {object} auditCtx
 * @returns {Promise<{ accessory: object }>}
 */
export async function deleteAccessoryMedia(app, accessoryId, auditCtx) {
  const existing = await app.prisma.accessory.findFirst({
    where: { id: accessoryId, deletedAt: null },
  });

  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Accessory not found',
      detail: `Active accessory ${accessoryId} does not exist.`,
    });
  }

  const previousStorageKey = existing.imageStorageKey;
  const updated = await app.prisma.$transaction(async (tx) => {
    const row = await tx.accessory.update({
      where: { id: accessoryId },
      data: {
        imageUrl: null,
        imageStorageKey: null,
        version: { increment: 1 },
      },
    });

    const mapped = mapAccessoryRecord(row);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'ACCESSORY_MEDIA_DELETED',
      entityType: 'Accessory',
      entityId: accessoryId,
      beforeState: {
        imageUrl: existing.imageUrl ?? null,
        imageStorageKey: previousStorageKey ?? null,
      },
      afterState: {
        imageUrl: null,
        imageStorageKey: null,
      },
    });

    return mapped;
  });

  if (previousStorageKey) {
    await safeDeleteObjectBestEffort(app, previousStorageKey);
  }
  await invalidateCatalogCache(app);

  return { accessory: updated };
}
