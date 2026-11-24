export const LOCALE_COOKIE_NAME = 'dirtfit_locale';
export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = Object.freeze(['en', 'vi']);

/**
 * Normalize any locale candidate strictly to 'en' or 'vi', defaulting to 'en'.
 * @param {string|null|undefined} value
 * @returns {'en'|'vi'}
 */
export function normalizeLocale(value) {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'vi') {
    return 'vi';
  }
  return DEFAULT_LOCALE;
}
