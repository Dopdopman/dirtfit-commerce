import crypto from 'node:crypto';
import { MEDIA_TYPES } from '@dirtfit/shared';

const MIME_TO_EXTENSION = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

const CATEGORIZED_BIKE_STORAGE_KEY_REGEX =
  /^bikes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(photos|blueprint|specs)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

const LEGACY_BIKE_STORAGE_KEY_REGEX =
  /^bikes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

const ACCESSORY_STORAGE_KEY_REGEX =
  /^accessories\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

/**
 * Resolve storage subfolder name based on BikeMedia type.
 * @param {string} [mediaType]
 * @returns {'photos'|'blueprint'|'specs'}
 */
function resolveBikeFolder(mediaType) {
  if (mediaType === MEDIA_TYPES.SIDE_PROFILE_BLUEPRINT) {
    return 'blueprint';
  }
  if (mediaType === MEDIA_TYPES.SPEC_SHEET) {
    return 'specs';
  }
  return 'photos';
}

/**
 * Generate a categorized, path-traversal-proof object storage key for a bike media upload.
 * Client-supplied filenames are intentionally discarded.
 * @param {string} bikeId
 * @param {string} mediaType
 * @param {string} mimeType
 * @returns {string}
 */
export function buildSafeBikeStorageKey(bikeId, mediaType, mimeType) {
  const ext = MIME_TO_EXTENSION[mimeType];
  if (!ext) {
    throw new Error(`Unsupported media MIME type: ${mimeType}`);
  }
  const folder = resolveBikeFolder(mediaType);
  return `bikes/${bikeId}/${folder}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Backward-compatible alias for buildSafeBikeStorageKey.
 * @param {string} bikeId
 * @param {string} mimeType
 * @param {string} [mediaType]
 * @returns {string}
 */
export function buildSafeStorageKey(bikeId, mimeType, mediaType = MEDIA_TYPES.GALLERY) {
  return buildSafeBikeStorageKey(bikeId, mediaType, mimeType);
}

/**
 * Generate a path-traversal-proof object storage key for an accessory product photo.
 * @param {string} accessoryId
 * @param {string} mimeType
 * @returns {string}
 */
export function buildSafeAccessoryStorageKey(accessoryId, mimeType) {
  const ext = MIME_TO_EXTENSION[mimeType];
  if (!ext) {
    throw new Error(`Unsupported media MIME type: ${mimeType}`);
  }
  return `accessories/${accessoryId}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Validate that a storageKey matches the canonical UUID key structure for the target bike
 * (supports both v2.1 categorized keys and legacy v1.0/v2.0 flat keys).
 * @param {string} storageKey
 * @param {string} expectedBikeId
 * @returns {boolean}
 */
export function validateSafeBikeStorageKey(storageKey, expectedBikeId) {
  if (typeof storageKey !== 'string') {
    return false;
  }
  const isValidShape =
    CATEGORIZED_BIKE_STORAGE_KEY_REGEX.test(storageKey) ||
    LEGACY_BIKE_STORAGE_KEY_REGEX.test(storageKey);
  if (!isValidShape) {
    return false;
  }
  return storageKey.startsWith(`bikes/${expectedBikeId}/`);
}

/**
 * Backward-compatible alias for validateSafeBikeStorageKey.
 * @param {string} storageKey
 * @param {string} expectedBikeId
 * @returns {boolean}
 */
export function validateSafeStorageKey(storageKey, expectedBikeId) {
  return validateSafeBikeStorageKey(storageKey, expectedBikeId);
}

/**
 * Validate that a storageKey matches the canonical UUID key structure for the target accessory.
 * @param {string} storageKey
 * @param {string} expectedAccessoryId
 * @returns {boolean}
 */
export function validateSafeAccessoryStorageKey(storageKey, expectedAccessoryId) {
  if (typeof storageKey !== 'string' || !ACCESSORY_STORAGE_KEY_REGEX.test(storageKey)) {
    return false;
  }
  return storageKey.startsWith(`accessories/${expectedAccessoryId}/`);
}

/**
 * Validate any non-prod local media read storageKey (prevents path traversal and arbitrary paths).
 * @param {string} storageKey
 * @returns {boolean}
 */
export function validateAnySafeStorageKey(storageKey) {
  if (typeof storageKey !== 'string' || storageKey.includes('..')) {
    return false;
  }
  return (
    CATEGORIZED_BIKE_STORAGE_KEY_REGEX.test(storageKey) ||
    LEGACY_BIKE_STORAGE_KEY_REGEX.test(storageKey) ||
    ACCESSORY_STORAGE_KEY_REGEX.test(storageKey)
  );
}

/**
 * Inspect binary file magic bytes to identify genuine JPEG, PNG, or WebP images.
 * @param {Buffer|Uint8Array} bytes
 * @returns {'image/jpeg'|'image/png'|'image/webp'|null}
 */
export function detectImageMimeFromBuffer(bytes) {
  if (!bytes || bytes.length < 12) {
    return null;
  }
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Detect active markup payloads disguised as raster images (XSS prevention for SVG/HTML/XML).
 * @param {Buffer} buf
 * @returns {boolean}
 */
function looksLikeMarkupOrText(buf) {
  const prefix = buf
    .subarray(0, 512)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();

  return (
    prefix.startsWith('<svg') ||
    prefix.startsWith('<?xml') ||
    prefix.startsWith('<!doctype') ||
    prefix.startsWith('<html') ||
    prefix.startsWith('<script') ||
    prefix.includes('<svg') ||
    prefix.includes('<script')
  );
}

/**
 * Verify that uploaded head bytes genuinely match the declared image MIME type.
 * @param {Buffer|Uint8Array} bytes
 * @param {string} declaredMimeType
 * @returns {{ valid: boolean, detectedMime: string|null, reason?: string }}
 */
export function verifyUploadedImageHeader(bytes, declaredMimeType) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buf.length < 12) {
    return {
      valid: false,
      detectedMime: null,
      reason: 'Uploaded file is empty or too short to be a valid image.',
    };
  }

  if (looksLikeMarkupOrText(buf)) {
    return {
      valid: false,
      detectedMime: 'text/markup',
      reason: 'Active SVG/HTML/XML markup payloads are strictly prohibited.',
    };
  }

  const detectedMime = detectImageMimeFromBuffer(buf);
  if (!detectedMime) {
    return {
      valid: false,
      detectedMime: null,
      reason: 'File signature does not match JPEG, PNG, or WebP magic bytes.',
    };
  }

  if (detectedMime !== declaredMimeType) {
    return {
      valid: false,
      detectedMime,
      reason: `Declared MIME (${declaredMimeType}) does not match actual binary signature (${detectedMime}).`,
    };
  }

  return { valid: true, detectedMime };
}
