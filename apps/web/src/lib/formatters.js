import { formatVnd as sharedFormatVnd } from '@dirtfit/shared/money';
import { DEFAULT_LOCALE, normalizeLocale } from './i18n/config.js';
import { getDictionary, getLocaleTag } from './i18n/translate.js';

/**
 * Format an integer VND amount according to active locale ('en' -> '245,000,000 VND', 'vi' -> '245.000.000 ₫').
 * @param {number|bigint} amount
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function formatVnd(amount, locale = DEFAULT_LOCALE) {
  const safe = Number(amount ?? 0);
  if (normalizeLocale(locale) === 'vi') {
    return sharedFormatVnd(safe);
  }
  return `${new Intl.NumberFormat('en-US').format(Math.round(safe))} VND`;
}

/**
 * Format date & time cleanly for the active locale.
 * @param {string|number|Date|null|undefined} value
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function formatDateTime(value, locale = DEFAULT_LOCALE) {
  if (!value) return '—';
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString(getLocaleTag(locale));
}

/**
 * Format millimeter telemetry value.
 * @param {number|null|undefined} mm
 * @returns {string}
 */
export function formatMm(mm) {
  if (mm === null || mm === undefined || Number.isNaN(Number(mm))) {
    return '—';
  }
  return `${Math.round(Number(mm))} mm`;
}

/**
 * Format signed millimeter/kg/degree delta with + or - prefix.
 * @param {number} value
 * @param {string} [unit]
 * @returns {string}
 */
export function formatSignedDelta(value, unit = 'mm') {
  const rounded = Math.round(Number(value ?? 0) * 10) / 10;
  if (rounded > 0) {
    return `+${rounded} ${unit}`;
  }
  if (rounded < 0) {
    return `${rounded} ${unit}`;
  }
  return `0 ${unit}`;
}

/**
 * Get localized status metadata for Rider Fit foot contact result.
 * @param {string} status
 * @param {'en'|'vi'} [locale]
 * @returns {{ label: string, badge: string, tone: string, className: string }}
 */
export function getFitStatusMeta(status, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  const entry = dict.enums.contactStatus[status] ?? {
    label: status ?? dict.common.specPending,
    badge: status ?? 'N/A',
    tone: 'muted',
  };
  return {
    ...entry,
    className: toneToBadgeClass(entry.tone),
  };
}

/**
 * Get localized status metadata for suspension rider sag classification.
 * @param {string} sagStatus
 * @param {'en'|'vi'} [locale]
 * @returns {{ label: string, tone: string, className: string }}
 */
export function getSagStatusMeta(sagStatus, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  const entry = dict.enums.sagStatus[sagStatus] ?? { label: sagStatus ?? '—', tone: 'muted' };
  return {
    ...entry,
    className: toneToBadgeClass(entry.tone),
  };
}

/**
 * Get localized motorcycle category name.
 * @param {string} category
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function getCategoryLabel(category, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  return dict.enums.categories[category] ?? category;
}

/**
 * Get localized riding focus name.
 * @param {string} focus
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function getRidingFocusLabel(focus, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  return dict.enums.ridingFocus[focus] ?? focus;
}

/**
 * Get localized footwear option label.
 * @param {string} footwear
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function getFootwearLabel(footwear, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  return dict.enums.footwear[footwear] ?? footwear;
}

/**
 * Get localized riding stance label.
 * @param {string} stance
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function getStanceLabel(stance, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  return dict.enums.stance[stance] ?? stance;
}

/**
 * Get localized accessory category label.
 * @param {string} category
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function getAccessoryCategoryLabel(category, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  return dict.enums.accessoryCategory[category] ?? category;
}

/**
 * Get localized showroom name, shortName, and address by showroom code.
 * @param {string} code
 * @param {'en'|'vi'} [locale]
 * @returns {{ code: string, name: string, shortName: string, address: string }}
 */
export function getShowroomMeta(code, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  const entry = dict.enums.showrooms[code] ?? {
    name: code,
    shortName: code,
    address: '',
  };
  return { code, ...entry };
}

/**
 * Get localized order status label and badge class.
 * @param {string} status
 * @param {'en'|'vi'} [locale]
 * @returns {{ label: string, tone: string, className: string, toneClass: string }}
 */
export function getOrderStatusMeta(status, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  const entry = dict.enums.orderStatus[status] ?? { label: status, tone: 'muted' };
  const cls = toneToBadgeClass(entry.tone);
  return {
    ...entry,
    className: cls,
    toneClass: cls,
  };
}

/**
 * Get localized test ride status label and badge class.
 * @param {string} status
 * @param {'en'|'vi'} [locale]
 * @returns {{ label: string, tone: string, className: string, toneClass: string }}
 */
export function getTestRideStatusMeta(status, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  const entry = dict.enums.testRideStatus[status] ?? { label: status, tone: 'muted' };
  const cls = toneToBadgeClass(entry.tone);
  return {
    ...entry,
    className: cls,
    toneClass: cls,
  };
}

/**
 * Map semantic tone identifier to high-contrast Industrial Motorsport badge utility classes.
 * @param {string} tone
 * @returns {string}
 */
export function toneToBadgeClass(tone) {
  switch (tone) {
    case 'flat':
      return 'border-fit-flat/40 bg-emerald-50 text-fit-flat';
    case 'balls':
      return 'border-fit-balls/40 bg-amber-50 text-fit-balls';
    case 'tiptoe':
      return 'border-fit-tiptoe/40 bg-orange-50 text-fit-tiptoe';
    case 'unsafe':
      return 'border-fit-unsafe/40 bg-red-50 text-fit-unsafe';
    default:
      return 'border-line bg-canvas text-ink-secondary';
  }
}
