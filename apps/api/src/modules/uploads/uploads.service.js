import { AppError, ERROR_CODES, MAX_MEDIA_UPLOAD_BYTES } from '@dirtfit/shared';
import { invalidateCatalogCache } from '../../common/cache/catalog-cache.js';
import {
  buildSafeStorageKey,
  validateSafeStorageKey,
  verifyUploadedImageHeader,
} from '../../common/storage/magic-bytes.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { mapBikeMedia } from '../catalog/catalog.mapper.js';

/**
 * Generate a restricted presigned upload grant for JPEG/PNG/WebP assets (<= 5MB).
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

  const storageKey = buildSafeStorageKey(payload.bikeId, payload.mimeType);
  const presigned = await app.storage.createPresignedUpload({
    storageKey,
    mimeType: payload.mimeType,
    sizeBytes: payload.sizeBytes,
    expiresInSeconds: 300,
  });

  return {
    bikeId: bike.id,
    mediaType: payload.mediaType,
    mimeType: payload.mimeType,
    maxSizeBytes: MAX_MEDIA_UPLOAD_BYTES,
    driver: app.storage.driver,
    ...presigned,
  };
}

/**
 * Confirm an uploaded object by reading its first 4KB, verifying Magic Bytes,
 * deleting spoofed/invalid objects, and persisting BikeMedia + AuditLog on success.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<{ media: object, verifiedMime: string }>}
 */
export async function confirmMediaUpload(app, payload, auditCtx) {
  if (!validateSafeStorageKey(payload.storageKey, payload.bikeId)) {
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

  const headMeta = await app.storage.headObject(payload.storageKey);
  if (headMeta.sizeBytes > MAX_MEDIA_UPLOAD_BYTES) {
    await app.storage.deleteObject(payload.storageKey);
    throw new AppError({
      code: ERROR_CODES.INVALID_UPLOAD_FILE,
      status: 422,
      title: 'Uploaded file exceeds maximum allowed size',
      detail: `Uploaded object (${headMeta.sizeBytes} bytes) exceeds max limit of ${MAX_MEDIA_UPLOAD_BYTES} bytes.`,
    });
  }

  const headBytes = await app.storage.readHeadBytes(payload.storageKey, 4096);
  const check = verifyUploadedImageHeader(headBytes, payload.declaredMimeType);

  if (!check.valid) {
    await app.storage.deleteObject(payload.storageKey);
    await recordAuditLog(app.prisma, {
      ...auditCtx,
      action: 'MEDIA_UPLOAD_REJECTED',
      entityType: 'Bike',
      entityId: payload.bikeId,
      beforeState: null,
      afterState: {
        storageKey: payload.storageKey,
        declaredMimeType: payload.declaredMimeType,
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

  const publicUrl = app.storage.getPublicUrl(payload.storageKey);
  const created = await app.prisma.$transaction(async (tx) => {
    // Respect Partial Unique Index uq_bike_single_primary_blueprint when replacing primary blueprint
    if (payload.isPrimary && payload.mediaType === 'SIDE_PROFILE_BLUEPRINT') {
      await tx.bikeMedia.updateMany({
        where: {
          bikeId: payload.bikeId,
          mediaType: 'SIDE_PROFILE_BLUEPRINT',
          isPrimary: true,
          deletedAt: null,
        },
        data: { isPrimary: false },
      });
    }

    const row = await tx.bikeMedia.create({
      data: {
        bikeId: payload.bikeId,
        url: publicUrl,
        storageKey: payload.storageKey,
        mediaType: payload.mediaType,
        altText: payload.altText ?? null,
        widthPx: payload.widthPx ?? null,
        heightPx: payload.heightPx ?? null,
        isPrimary: payload.isPrimary,
        sortOrder: payload.sortOrder,
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
        verifiedMime: check.detectedMime,
        sizeBytes: headMeta.sizeBytes,
      },
    });

    return mapped;
  });

  await invalidateCatalogCache(app);

  return {
    media: created,
    verifiedMime: check.detectedMime,
  };
}
