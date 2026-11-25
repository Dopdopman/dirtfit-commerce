import { MEDIA_TYPES } from './enums.js';

export const IMAGE_KINDS = Object.freeze({
  PHOTO: 'PHOTO',
  BLUEPRINT: 'BLUEPRINT',
  PLACEHOLDER: 'PLACEHOLDER',
});

const PLACEHOLDER_HOST_REGEX =
  /^https?:\/\/(?:cdn\.dirtfit\.vn|example\.com|placeholder\.local)(?:\/|$)/i;
const SAFE_IMAGE_URL_REGEX =
  /^(?:https:\/\/[^\s]+|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/[^\s]+|\/[^\s/][^\s]*)$/i;

/**
 * Determine whether a media URL is empty or a non-live seeded placeholder (e.g. cdn.dirtfit.vn).
 * Prevents browser ERR_NAME_NOT_RESOLVED console spam before real photos are uploaded to R2/local.
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function isPlaceholderMediaUrl(url) {
  if (typeof url !== 'string') {
    return true;
  }
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return true;
  }
  return PLACEHOLDER_HOST_REGEX.test(trimmed);
}

/**
 * Validate that an image URL uses a safe browser-renderable scheme (https, localhost http, or relative path).
 * Blocks javascript:, data:text/html, and malformed schemes.
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function isSafeImageUrl(url) {
  if (typeof url !== 'string') {
    return false;
  }
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 1024) {
    return false;
  }
  return SAFE_IMAGE_URL_REGEX.test(trimmed);
}

/**
 * Check whether a URL is a real, safe, non-placeholder image suitable for rendering in `<img>`.
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function isLiveImageUrl(url) {
  return !isPlaceholderMediaUrl(url) && isSafeImageUrl(url);
}

/**
 * Check whether a BikeMedia type belongs to the commercial real-photo domain (HERO / GALLERY).
 * @param {string|null|undefined} mediaType
 * @returns {boolean}
 */
export function isCommercialPhotoType(mediaType) {
  return mediaType === MEDIA_TYPES.HERO || mediaType === MEDIA_TYPES.GALLERY;
}

/**
 * Build canonical Storefront deep-link URL for a motorcycle.
 * @param {string|null|undefined} slug
 * @returns {string}
 */
export function buildBikeProductUrl(slug) {
  if (typeof slug !== 'string' || slug.trim().length === 0) {
    return '/bikes';
  }
  return `/bikes/${encodeURIComponent(slug.trim())}`;
}

/**
 * Build canonical Storefront deep-link URL for an accessory using SKU highlight query param.
 * @param {string|null|undefined} sku
 * @returns {string}
 */
export function buildAccessoryProductUrl(sku) {
  if (typeof sku !== 'string' || sku.trim().length === 0) {
    return '/accessories';
  }
  return `/accessories?sku=${encodeURIComponent(sku.trim())}`;
}

/**
 * Deterministic comparator for BikeMedia lists: primary first, then sortOrder ASC, then createdAt ASC.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareBikeMedia(a, b) {
  const primaryDiff = (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
  if (primaryDiff !== 0) {
    return primaryDiff;
  }
  const sortDiff = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
  if (sortDiff !== 0) {
    return sortDiff;
  }
  const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

/**
 * Resolve a motorcycle's media assets into strictly separated commercial photo and 2D blueprint views
 * following the canonical v2.1 Fallback Hierarchy (ignoring soft-deleted rows and dead seed placeholders).
 * @param {Array<object>|null|undefined} mediaList
 * @returns {{
 *   coverImageUrl: string|null,
 *   coverImageKind: 'PHOTO'|'BLUEPRINT'|'PLACEHOLDER',
 *   commercialImageUrl: string|null,
 *   commercialImageKind: 'PHOTO'|'BLUEPRINT'|'PLACEHOLDER',
 *   primaryPhoto: object|null,
 *   galleryImages: Array<object>,
 *   blueprintImageUrl: string|null,
 *   primaryBlueprint: object|null,
 * }}
 */
export function resolveBikeMedia(mediaList) {
  const active = Array.isArray(mediaList)
    ? mediaList.filter((item) => item && !item.deletedAt)
    : [];

  const allRealPhotos = active
    .filter((item) => isCommercialPhotoType(item.mediaType))
    .sort(compareBikeMedia);
  const liveRealPhotos = allRealPhotos.filter((item) => isLiveImageUrl(item.url));

  const allBlueprints = active
    .filter((item) => item.mediaType === MEDIA_TYPES.SIDE_PROFILE_BLUEPRINT)
    .sort(compareBikeMedia);
  const liveBlueprints = allBlueprints.filter((item) => isLiveImageUrl(item.url));

  const primaryPhoto = liveRealPhotos.find((item) => item.isPrimary) ?? liveRealPhotos[0] ?? null;
  const primaryLiveBlueprint =
    liveBlueprints.find((item) => item.isPrimary) ?? liveBlueprints[0] ?? null;
  const primaryBlueprint =
    primaryLiveBlueprint ??
    allBlueprints.find((item) => item.isPrimary) ??
    allBlueprints[0] ??
    null;

  const coverImageUrl = primaryPhoto?.url ?? null;
  const blueprintImageUrl = primaryLiveBlueprint?.url ?? null;

  let commercialImageUrl = null;
  let commercialImageKind = IMAGE_KINDS.PLACEHOLDER;

  if (coverImageUrl) {
    commercialImageUrl = coverImageUrl;
    commercialImageKind = IMAGE_KINDS.PHOTO;
  } else if (blueprintImageUrl) {
    commercialImageUrl = blueprintImageUrl;
    commercialImageKind = IMAGE_KINDS.BLUEPRINT;
  }

  return {
    coverImageUrl,
    coverImageKind: commercialImageKind,
    commercialImageUrl,
    commercialImageKind,
    primaryPhoto,
    galleryImages: liveRealPhotos,
    blueprintImageUrl,
    primaryBlueprint,
  };
}

/**
 * Resolve an accessory's live product photo and imageKind cleanly without exposing broken placeholders.
 * @param {object|null|undefined} accessory
 * @returns {{ imageUrl: string|null, imageKind: 'PHOTO'|'PLACEHOLDER' }}
 */
export function resolveAccessoryMedia(accessory) {
  const rawUrl = accessory?.imageUrl ?? null;
  if (isLiveImageUrl(rawUrl)) {
    return {
      imageUrl: rawUrl.trim(),
      imageKind: IMAGE_KINDS.PHOTO,
    };
  }
  return {
    imageUrl: null,
    imageKind: IMAGE_KINDS.PLACEHOLDER,
  };
}
