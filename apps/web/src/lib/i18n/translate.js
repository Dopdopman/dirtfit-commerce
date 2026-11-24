import { DEFAULT_LOCALE, normalizeLocale } from './config.js';
import { EN_DICT } from './en.js';
import { VI_DICT } from './vi.js';

export const DICTIONARIES = Object.freeze({
  en: EN_DICT,
  vi: VI_DICT,
});

/**
 * Resolve the immutable dictionary object for the given locale.
 * @param {string|null|undefined} [locale]
 * @returns {typeof EN_DICT}
 */
export function getDictionary(locale = DEFAULT_LOCALE) {
  return DICTIONARIES[normalizeLocale(locale)];
}

/**
 * Resolve BCP 47 locale tag for Intl formatters.
 * @param {string|null|undefined} [locale]
 * @returns {'en-US'|'vi-VN'}
 */
export function getLocaleTag(locale = DEFAULT_LOCALE) {
  return normalizeLocale(locale) === 'vi' ? 'vi-VN' : 'en-US';
}

/**
 * Lookup nested key in a dictionary object using dot notation.
 * @param {object} obj
 * @param {string} pathKey
 * @returns {unknown}
 */
function getByPath(obj, pathKey) {
  const segments = pathKey.split('.');
  let current = obj;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

/**
 * Interpolate `{param}` tokens into a localized template string.
 * @param {string} template
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function interpolateParams(template, params) {
  if (!params || typeof template !== 'string') {
    return template;
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(params, key) && params[key] !== undefined
      ? String(params[key])
      : `{${key}}`
  );
}

/**
 * Translate a dot-path key with fallback to English and parameter interpolation.
 * @param {string|null|undefined} locale
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function translate(locale, key, params) {
  const dict = getDictionary(locale);
  const raw = getByPath(dict, key) ?? getByPath(EN_DICT, key);
  if (typeof raw === 'string') {
    return interpolateParams(raw, params);
  }
  return key;
}

/**
 * Return localized short summary for seeded motorcycles (falls back to API shortSummary).
 * @param {object|null|undefined} bike
 * @param {string|null|undefined} [locale]
 * @returns {string}
 */
export function getBikeSummary(bike, locale = DEFAULT_LOCALE) {
  if (!bike) {
    return '';
  }
  const normalized = normalizeLocale(locale);
  const dict = getDictionary(normalized);
  if (normalized === 'en' && bike.slug && dict.bikeSummaries?.[bike.slug]) {
    return dict.bikeSummaries[bike.slug];
  }
  return bike.shortSummary || dict.bikeSummaries?.[bike.slug] || '';
}

/**
 * Localize an API error object using known error codes while preserving useful details.
 * @param {unknown} err
 * @param {string|null|undefined} [locale]
 * @returns {string}
 */
export function localizeApiError(err, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code || '') : '';
  if (code && dict.errors && Object.prototype.hasOwnProperty.call(dict.errors, code)) {
    const baseMsg = dict.errors[code];
    const detail =
      err && typeof err === 'object' && 'detail' in err && err.detail ? String(err.detail) : '';
    return code === 'INVALID_UPLOAD_FILE' && detail ? `${baseMsg} (${detail})` : baseMsg;
  }
  if (err && typeof err === 'object') {
    if ('detail' in err && err.detail) return String(err.detail);
    if ('message' in err && err.message) return String(err.message);
  }
  return dict.common.errorGeneric;
}
