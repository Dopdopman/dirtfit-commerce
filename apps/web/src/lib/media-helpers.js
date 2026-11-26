import {
  IMAGE_KINDS,
  buildAccessoryProductUrl,
  buildBikeProductUrl,
  isLiveImageUrl,
  isPlaceholderMediaUrl,
  isSafeImageUrl,
  resolveAccessoryMedia,
  resolveBikeMedia,
} from '@dirtfit/shared';
import { getPublicApiBaseUrl } from '@/lib/api-client';

export const ALLOWED_UPLOAD_IMAGE_MIMES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME_TO_EXTENSION = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

/**
 * Normalize a verified live media URL for browser `<img src>`, expanding API-relative paths
 * (`/api/v1/media/local/...`) against the configured public API origin.
 * Returns `null` for seeded placeholder URLs or unsafe schemes.
 * @param {string|null|undefined} url
 * @param {string} [apiBaseUrl]
 * @returns {string|null}
 */
export function resolveClientMediaUrl(url, apiBaseUrl = getPublicApiBaseUrl()) {
  if (!isLiveImageUrl(url)) {
    return null;
  }
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) {
    const normalizedBase = String(apiBaseUrl || '').replace(/\/+$/, '');
    return normalizedBase ? `${normalizedBase}${trimmed}` : trimmed;
  }
  return trimmed;
}

/**
 * Resolve Storefront card and gallery image metadata for a motorcycle object.
 * Prefers pre-computed summary fields (`coverImageUrl`, `galleryImages`) when present
 * and falls back cleanly to `resolveBikeMedia(bike.media)`.
 * @param {object|null|undefined} bike
 * @param {string} [apiBaseUrl]
 * @returns {{
 *   coverUrl: string|null,
 *   hasRealPhoto: boolean,
 *   blueprintUrl: string|null,
 *   galleryImages: Array<{ id: string, url: string, altText: string|null, isPrimary: boolean, mediaType: string }>,
 * }}
 */
export function getBikeCardMedia(bike, apiBaseUrl = getPublicApiBaseUrl()) {
  if (!bike) {
    return {
      coverUrl: null,
      hasRealPhoto: false,
      blueprintUrl: null,
      galleryImages: [],
    };
  }

  const resolvedFromList = resolveBikeMedia(bike.media);
  const rawGallery =
    Array.isArray(bike.galleryImages) && bike.galleryImages.length > 0
      ? bike.galleryImages
      : resolvedFromList.galleryImages;

  const galleryImages = [];
  const seenKeys = new Set();
  for (const item of rawGallery) {
    if (!item || item.deletedAt) continue;
    const normalizedUrl = resolveClientMediaUrl(item.url, apiBaseUrl);
    if (!normalizedUrl) continue;
    const dedupeKey = item.id || normalizedUrl;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    galleryImages.push({
      ...item,
      id: item.id || normalizedUrl,
      url: normalizedUrl,
      altText: item.altText || bike.name || null,
    });
  }

  const rawCoverUrl = bike.coverImageUrl ?? resolvedFromList.coverImageUrl ?? galleryImages[0]?.url;
  const coverUrl = resolveClientMediaUrl(rawCoverUrl, apiBaseUrl) ?? galleryImages[0]?.url ?? null;
  const blueprintUrl = resolveClientMediaUrl(
    bike.blueprintImageUrl ?? resolvedFromList.blueprintImageUrl,
    apiBaseUrl
  );

  return {
    coverUrl,
    hasRealPhoto: Boolean(coverUrl),
    blueprintUrl,
    galleryImages,
  };
}

/**
 * Resolve live product photo metadata for an accessory object.
 * @param {object|null|undefined} accessory
 * @param {string} [apiBaseUrl]
 * @returns {{ imageUrl: string|null, hasRealPhoto: boolean, imageKind: 'PHOTO'|'PLACEHOLDER' }}
 */
export function getAccessoryCardMedia(accessory, apiBaseUrl = getPublicApiBaseUrl()) {
  const resolved = resolveAccessoryMedia(accessory);
  const clientUrl = resolveClientMediaUrl(resolved.imageUrl, apiBaseUrl);
  return {
    imageUrl: clientUrl,
    hasRealPhoto: Boolean(clientUrl),
    imageKind: clientUrl ? IMAGE_KINDS.PHOTO : IMAGE_KINDS.PLACEHOLDER,
  };
}

/**
 * Resolve canonical Storefront navigation href for a cart item or order item.
 * @param {object|null|undefined} item
 * @returns {string}
 */
export function resolveItemProductUrl(item) {
  if (!item) {
    return '/bikes';
  }
  const directUrl = item.productUrl || item.product?.productUrl;
  if (typeof directUrl === 'string' && directUrl.startsWith('/') && !directUrl.startsWith('//')) {
    return directUrl;
  }
  if (item.itemType === 'BIKE') {
    return buildBikeProductUrl(item.slug || item.product?.slug);
  }
  if (item.itemType === 'ACCESSORY') {
    return buildAccessoryProductUrl(item.skuSnapshot || item.sku || item.product?.sku);
  }
  return '/bikes';
}

/**
 * Detect genuine raster image MIME type directly from leading binary magic bytes.
 * Matches backend 4KB Magic Bytes rules 1:1 (JPEG, PNG, WebP only; minimum 12 bytes).
 * @param {Uint8Array|ArrayBuffer|null|undefined} bytes
 * @returns {'image/jpeg'|'image/png'|'image/webp'|null}
 */
export function detectImageMimeFromBytes(bytes) {
  if (!bytes) {
    return null;
  }
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.length < 12) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    view[0] === 0x89 &&
    view[1] === 0x50 &&
    view[2] === 0x4e &&
    view[3] === 0x47 &&
    view[4] === 0x0d &&
    view[5] === 0x0a &&
    view[6] === 0x1a &&
    view[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF....WEBP (bytes 0..3 = 'RIFF', bytes 8..11 = 'WEBP')
  if (
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x45 &&
    view[10] === 0x42 &&
    view[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Sniff up to the first 16 bytes of a browser File/Blob to determine actual binary image MIME type.
 * Safe in modern browsers and Vitest/jsdom without loading the full image into memory.
 * @param {File|Blob|null|undefined} file
 * @returns {Promise<'image/jpeg'|'image/png'|'image/webp'|null>}
 */
export async function detectBrowserImageMime(file) {
  if (!file || typeof file.slice !== 'function') {
    return null;
  }
  const headBlob = file.slice(0, 16);
  let arrayBuffer;
  if (typeof headBlob.arrayBuffer === 'function') {
    arrayBuffer = await headBlob.arrayBuffer();
  } else if (typeof Response !== 'undefined') {
    arrayBuffer = await new Response(headBlob).arrayBuffer();
  } else {
    return null;
  }
  return detectImageMimeFromBytes(new Uint8Array(arrayBuffer));
}

/**
 * Rewrite filename extension to match the detected binary MIME type (clamped to <= 180 chars).
 * @param {string|null|undefined} fileName
 * @param {'image/jpeg'|'image/png'|'image/webp'} detectedMime
 * @returns {string}
 */
export function normalizeFilenameExtension(fileName, detectedMime) {
  const targetExt = MIME_TO_EXTENSION[detectedMime] || 'bin';
  const raw =
    typeof fileName === 'string' && fileName.trim() ? fileName.trim() : `image.${targetExt}`;
  const lastDot = raw.lastIndexOf('.');
  const baseName = lastDot > 0 ? raw.slice(0, lastDot) : raw;
  const maxBaseLen = Math.max(1, 180 - targetExt.length - 1);
  return `${baseName.slice(0, maxBaseLen)}.${targetExt}`;
}

/**
 * Inspect a browser File before upload by checking size (<= 5MB) and sniffing its 16-byte header.
 * Auto-normalizes mismatched extensions (e.g. CDN `.png` file containing WebP bytes) to the real
 * binary MIME type so presign, R2 PUT Content-Type, and 4KB Magic Bytes confirm always agree.
 * @param {File|Blob|null|undefined} file
 * @returns {Promise<object>}
 */
export async function inspectImageFileForUpload(file) {
  if (!file || typeof file.size !== 'number' || file.size <= 0) {
    return { valid: false, errorCode: 'EMPTY_FILE' };
  }

  const declaredMime = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';

  if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
    return { valid: false, errorCode: 'FILE_TOO_LARGE', declaredMime: declaredMime || null };
  }

  if (file.size < 12) {
    return {
      valid: false,
      errorCode: 'UNSUPPORTED_BINARY_FORMAT',
      declaredMime: declaredMime || null,
    };
  }

  const detectedMime = await detectBrowserImageMime(file);
  if (!detectedMime) {
    return {
      valid: false,
      errorCode: 'UNSUPPORTED_BINARY_FORMAT',
      declaredMime: declaredMime || null,
    };
  }

  const mimeCorrected = Boolean(declaredMime && declaredMime !== detectedMime);
  const normalizedFileName = normalizeFilenameExtension(
    typeof file.name === 'string' ? file.name : '',
    detectedMime
  );

  return {
    valid: true,
    mimeType: detectedMime,
    declaredMime: declaredMime || null,
    mimeCorrected,
    sizeBytes: file.size,
    normalizedFileName,
  };
}

/**
 * Synchronous lightweight check on declared File metadata (kept for backward compatibility).
 * Upload components should prefer `inspectImageFileForUpload()` for real binary header sniffing.
 * @param {File|null|undefined} file
 * @returns {{ valid: true, mimeType: string, sizeBytes: number } | { valid: false, errorCode: 'EMPTY_FILE'|'INVALID_TYPE'|'FILE_TOO_LARGE' }}
 */
export function validateImageFileForUpload(file) {
  if (!file || typeof file.size !== 'number' || file.size <= 0) {
    return { valid: false, errorCode: 'EMPTY_FILE' };
  }
  const mimeType = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';
  if (!ALLOWED_UPLOAD_IMAGE_MIMES.includes(mimeType)) {
    return { valid: false, errorCode: 'INVALID_TYPE' };
  }
  if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
    return { valid: false, errorCode: 'FILE_TOO_LARGE' };
  }
  return { valid: true, mimeType, sizeBytes: file.size };
}

/**
 * Read pixel dimensions of an image File using an in-memory object URL (browser only).
 * Caller is responsible for revoking `objectUrl` when no longer displayed.
 * @param {File} file
 * @returns {Promise<{ objectUrl: string, widthPx: number, heightPx: number }>}
 */
export function readBrowserImageDimensions(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        objectUrl,
        widthPx: Math.max(200, Math.min(8000, img.naturalWidth || 1200)),
        heightPx: Math.max(200, Math.min(8000, img.naturalHeight || 800)),
      });
    };
    img.onerror = () => {
      resolve({ objectUrl, widthPx: 1200, heightPx: 800 });
    };
    img.src = objectUrl;
  });
}

export { IMAGE_KINDS, isLiveImageUrl, isPlaceholderMediaUrl, isSafeImageUrl };
