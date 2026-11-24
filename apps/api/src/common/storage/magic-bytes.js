import crypto from 'node:crypto';

const MIME_TO_EXTENSION = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

const SAFE_STORAGE_KEY_REGEX =
  /^bikes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

/**
 * Generate a collision-free, path-traversal-proof object storage key for a bike media upload.
 * Client-supplied filenames are intentionally discarded.
 * @param {string} bikeId
 * @param {string} mimeType
 * @returns {string}
 */
export function buildSafeStorageKey(bikeId, mimeType) {
  const ext = MIME_TO_EXTENSION[mimeType];
  if (!ext) {
    throw new Error(`Unsupported media MIME type: ${mimeType}`);
  }
  return `bikes/${bikeId}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Validate that a storageKey matches the canonical UUID key structure for the target bike.
 * @param {string} storageKey
 * @param {string} expectedBikeId
 * @returns {boolean}
 */
export function validateSafeStorageKey(storageKey, expectedBikeId) {
  if (typeof storageKey !== 'string' || !SAFE_STORAGE_KEY_REGEX.test(storageKey)) {
    return false;
  }
  return storageKey.startsWith(`bikes/${expectedBikeId}/`);
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
