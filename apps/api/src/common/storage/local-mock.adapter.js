import crypto from 'node:crypto';
import { AppError, ERROR_CODES } from '@dirtfit/shared';

/**
 * Create an in-memory local mock storage adapter mirroring R2StorageAdapter behavior for dev/CI/test.
 * @param {object} env
 * @returns {object}
 */
export function createLocalMockStorageAdapter(env) {
  const tokens = new Map();
  const objects = new Map();
  const apiBaseUrl = env.API_URL.replace(/\/+$/, '');
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');

  return {
    driver: 'local',

    /**
     * Build public CDN URL for a verified storage key.
     * @param {string} storageKey
     * @returns {string}
     */
    getPublicUrl(storageKey) {
      return `${publicBaseUrl}/${storageKey}`;
    },

    /**
     * Issue a signed local mock upload URL valid for a short single-use TTL.
     * @param {object} params
     * @param {string} params.storageKey
     * @param {string} params.mimeType
     * @param {number} params.sizeBytes
     * @param {number} [params.expiresInSeconds]
     * @returns {Promise<object>}
     */
    async createPresignedUpload({ storageKey, mimeType, sizeBytes, expiresInSeconds = 300 }) {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = Date.now() + expiresInSeconds * 1000;

      tokens.set(token, {
        storageKey,
        declaredMimeType: mimeType,
        expectedSizeBytes: sizeBytes,
        expiresAt,
        used: false,
      });

      const uploadPath = `/api/v1/admin/media/local-upload/${token}`;
      return {
        storageKey,
        uploadUrl: `${apiBaseUrl}${uploadPath}`,
        uploadPath,
        method: 'PUT',
        headers: {
          'content-type': mimeType,
        },
        publicUrl: `${publicBaseUrl}/${storageKey}`,
        expiresInSeconds,
      };
    },

    /**
     * Accept raw binary upload bytes for a local mock presigned PUT token.
     * @param {string} token
     * @param {Buffer|Uint8Array} buffer
     * @param {string|null} [contentType]
     * @returns {Promise<{ storageKey: string, sizeBytes: number }>}
     */
    async receiveLocalUpload(token, buffer, contentType = null) {
      const grant = tokens.get(token);
      if (!grant || grant.used || grant.expiresAt < Date.now()) {
        throw new AppError({
          code: ERROR_CODES.UNAUTHORIZED,
          status: 403,
          title: 'Invalid or expired upload token',
          detail: 'The presigned upload URL is invalid, already used, or expired.',
        });
      }

      const rawBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
      grant.used = true;
      objects.set(grant.storageKey, {
        buffer: rawBuffer,
        contentType: contentType ?? grant.declaredMimeType,
        sizeBytes: rawBuffer.length,
        uploadedAt: new Date().toISOString(),
      });

      return {
        storageKey: grant.storageKey,
        sizeBytes: rawBuffer.length,
      };
    },

    /**
     * Inspect stored object metadata.
     * @param {string} storageKey
     * @returns {Promise<{ sizeBytes: number, contentType: string|null }>}
     */
    async headObject(storageKey) {
      const entry = objects.get(storageKey);
      if (!entry) {
        throw new AppError({
          code: ERROR_CODES.NOT_FOUND,
          status: 404,
          title: 'Uploaded object not found',
          detail: `No uploaded object exists at storage key ${storageKey}.`,
        });
      }
      return {
        sizeBytes: entry.sizeBytes,
        contentType: entry.contentType,
      };
    },

    /**
     * Read first N bytes from the stored object for Magic Bytes inspection.
     * @param {string} storageKey
     * @param {number} [maxBytes]
     * @returns {Promise<Buffer>}
     */
    async readHeadBytes(storageKey, maxBytes = 4096) {
      const entry = objects.get(storageKey);
      if (!entry) {
        throw new AppError({
          code: ERROR_CODES.NOT_FOUND,
          status: 404,
          title: 'Uploaded object not found',
          detail: `No uploaded object exists at storage key ${storageKey}.`,
        });
      }
      return entry.buffer.subarray(0, maxBytes);
    },

    /**
     * Remove an object from local mock storage.
     * @param {string} storageKey
     * @returns {Promise<void>}
     */
    async deleteObject(storageKey) {
      objects.delete(storageKey);
    },

    /**
     * Check whether an object currently exists in local mock storage (for tests).
     * @param {string} storageKey
     * @returns {boolean}
     */
    hasObject(storageKey) {
      return objects.has(storageKey);
    },

    async close() {
      tokens.clear();
      objects.clear();
    },
  };
}
