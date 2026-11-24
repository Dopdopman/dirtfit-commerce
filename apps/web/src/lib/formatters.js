import { formatVnd as sharedFormatVnd } from '@dirtfit/shared/money';
import { VI_DICT } from './i18n/vi.js';

/**
 * Format an integer VND amount cleanly for UI telemetry display.
 * @param {number|bigint} amount
 * @returns {string}
 */
export function formatVnd(amount) {
  return sharedFormatVnd(amount ?? 0);
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
 * @returns {{ label: string, badge: string, tone: string, className: string }}
 */
export function getFitStatusMeta(status) {
  const entry = VI_DICT.contactStatus[status] ?? {
    label: status ?? 'Chưa đánh giá',
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
 * @returns {{ label: string, tone: string, className: string }}
 */
export function getSagStatusMeta(sagStatus) {
  const entry = VI_DICT.sagStatus[sagStatus] ?? { label: sagStatus ?? '—', tone: 'muted' };
  return {
    ...entry,
    className: toneToBadgeClass(entry.tone),
  };
}

/**
 * Get localized motorcycle category name.
 * @param {string} category
 * @returns {string}
 */
export function getCategoryLabel(category) {
  return VI_DICT.categories[category] ?? category;
}

/**
 * Get localized riding focus name.
 * @param {string} focus
 * @returns {string}
 */
export function getRidingFocusLabel(focus) {
  return VI_DICT.ridingFocus[focus] ?? focus;
}

/**
 * Get localized order status label and badge class.
 * @param {string} status
 * @returns {{ label: string, tone: string, className: string }}
 */
export function getOrderStatusMeta(status) {
  const entry = VI_DICT.orderStatus[status] ?? { label: status, tone: 'muted' };
  return {
    ...entry,
    className: toneToBadgeClass(entry.tone),
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
