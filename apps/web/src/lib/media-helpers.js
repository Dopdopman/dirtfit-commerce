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
 * Validate a browser File before requesting an upload presign URL.
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
