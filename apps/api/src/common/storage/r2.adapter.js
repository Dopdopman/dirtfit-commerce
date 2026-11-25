import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError, ERROR_CODES } from '@dirtfit/shared';

/**
 * Read a Node stream or AWS SDK streaming payload into a Buffer.
 * @param {object} body
 * @returns {Promise<Buffer>}
 */
async function bodyToBuffer(body) {
  if (!body) {
    return Buffer.alloc(0);
  }
  if (typeof body.transformToByteArray === 'function') {
    const arr = await body.transformToByteArray();
    return Buffer.from(arr);
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Create a Cloudflare R2 S3-compatible storage adapter for presigned uploads and 4KB inspections.
 * @param {object} env
 * @returns {object}
 */
export function createR2StorageAdapter(env) {
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  const bucket = env.R2_BUCKET_NAME;
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');

  return {
    driver: 'r2',

    /**
     * Build public CDN URL for a verified storage key.
     * @param {string} storageKey
     * @returns {string}
     */
    getPublicUrl(storageKey) {
      return `${publicBaseUrl}/${storageKey}`;
    },

    /**
     * Issue an S3 Presigned PUT URL restricted to the declared Content-Type.
     * @param {object} params
     * @param {string} params.storageKey
     * @param {string} params.mimeType
     * @param {number} [params.expiresInSeconds]
     * @returns {Promise<object>}
     */
    async createPresignedUpload({ storageKey, mimeType, expiresInSeconds = 300 }) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ContentType: mimeType,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });

      return {
        storageKey,
        uploadUrl,
        method: 'PUT',
        headers: {
          'content-type': mimeType,
        },
        publicUrl: `${publicBaseUrl}/${storageKey}`,
        expiresInSeconds,
      };
    },

    /**
     * Fetch object metadata (size and content-type) from R2.
     * @param {string} storageKey
     * @returns {Promise<{ sizeBytes: number, contentType: string|null }>}
     */
    async headObject(storageKey) {
      try {
        const res = await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: storageKey,
          })
        );
        return {
          sizeBytes: Number(res.ContentLength ?? 0),
          contentType: res.ContentType ?? null,
        };
      } catch (err) {
        if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
          throw new AppError({
            code: ERROR_CODES.NOT_FOUND,
            status: 404,
            title: 'Uploaded object not found',
            detail: `No uploaded object exists at storage key ${storageKey}.`,
          });
        }
        throw err;
      }
    },

    /**
     * Read only the first N bytes from R2 via HTTP Range request for Magic Bytes verification.
     * @param {string} storageKey
     * @param {number} [maxBytes]
     * @returns {Promise<Buffer>}
     */
    async readHeadBytes(storageKey, maxBytes = 4096) {
      try {
        const res = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: storageKey,
            Range: `bytes=0-${Math.max(63, maxBytes - 1)}`,
          })
        );
        return bodyToBuffer(res.Body);
      } catch (err) {
        if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') {
          throw new AppError({
            code: ERROR_CODES.NOT_FOUND,
            status: 404,
            title: 'Uploaded object not found',
            detail: `No uploaded object exists at storage key ${storageKey}.`,
          });
        }
        throw err;
      }
    },

    /**
     * Delete an object from R2 (best-effort; ignores 404/NoSuchKey).
     * @param {string} storageKey
     * @returns {Promise<void>}
     */
    async deleteObject(storageKey) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: storageKey,
          })
        );
      } catch (err) {
        if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') {
          return;
        }
        throw err;
      }
    },

    async close() {
      client.destroy();
    },
  };
}
