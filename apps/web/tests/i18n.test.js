import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatVnd,
  getCategoryLabel,
  getFitStatusMeta,
  getOrderStatusMeta,
  getSagStatusMeta,
  getShowroomMeta,
} from '@/lib/formatters';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, normalizeLocale } from '@/lib/i18n/config';
import { EN_DICT } from '@/lib/i18n/en';
import { getBikeSummary, getDictionary, localizeApiError, translate } from '@/lib/i18n/translate';
import { VI_DICT } from '@/lib/i18n/vi';

/**
 * Recursively collect every leaf key path alongside its string value or node type.
 * @param {object} obj
 * @param {string} [prefix]
 * @returns {Map<string, string>}
 */
function flattenLeaves(obj, prefix = '') {
  const result = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenLeaves(value, fullKey);
      for (const [nk, nv] of nested.entries()) {
        result.set(nk, nv);
      }
    } else {
      result.set(fullKey, typeof value === 'string' ? value : String(value));
    }
  }
  return result;
}

describe('DirtFit i18n Dictionaries (EN / VI) & Localization Formatters', () => {
  it('maintains 100% key parity and non-empty translations between EN_DICT and VI_DICT', () => {
    const enLeaves = flattenLeaves(EN_DICT);
    const viLeaves = flattenLeaves(VI_DICT);

    const missingInVi = [];
    const missingInEn = [];
    const emptyEn = [];
    const emptyVi = [];

    for (const [key, val] of enLeaves.entries()) {
      if (!viLeaves.has(key)) {
        missingInVi.push(key);
      }
      if (!val || val.trim().length === 0) {
        emptyEn.push(key);
      }
    }

    for (const [key, val] of viLeaves.entries()) {
      if (!enLeaves.has(key)) {
        missingInEn.push(key);
      }
      if (!val || val.trim().length === 0) {
        emptyVi.push(key);
      }
    }

    expect(missingInVi).toEqual([]);
    expect(missingInEn).toEqual([]);
    expect(emptyEn).toEqual([]);
    expect(emptyVi).toEqual([]);
    expect(enLeaves.size).toBeGreaterThan(200);
  });

  it('defaults strictly to English (en) and resolves nested keys + placeholders accurately', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALE_COOKIE_NAME).toBe('dirtfit_locale');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
    expect(normalizeLocale('')).toBe('en');
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale('vi')).toBe('vi');

    expect(getDictionary().home.allBikesBtn).toBe('Full Catalog');
    expect(getDictionary('vi').home.allBikesBtn).toBe('Toàn bộ danh mục');

    expect(translate('en', 'catalog.countResults', { count: 8 })).toBe('8 motorcycles');
    expect(translate('vi', 'catalog.countResults', { count: 8 })).toBe('8 mẫu xe');

    const ktm = { slug: 'ktm-350-exc-f', shortSummary: 'VN summary' };
    expect(getBikeSummary(ktm, 'en')).toContain('WP XACT');
    expect(getBikeSummary(ktm, 'vi')).toBe('VN summary');

    expect(localizeApiError({ code: 'INVALID_CREDENTIALS' }, 'en')).toBe(
      'Incorrect email or password.'
    );
    expect(localizeApiError({ code: 'INVALID_CREDENTIALS' }, 'vi')).toBe(
      'Email hoặc mật khẩu không chính xác.'
    );
  });

  it('formats VND currency, timestamps, and enum labels distinctly between en and vi', () => {
    expect(formatVnd(245_000_000)).toBe('245,000,000 VND');
    expect(formatVnd(245_000_000, 'en')).toBe('245,000,000 VND');
    expect(formatVnd(245_000_000, 'vi')).toContain('245.000.000');
    expect(formatVnd(245_000_000, 'vi')).toContain('₫');

    expect(formatDateTime('2026-11-25T08:00:00Z', 'en')).not.toBe('—');
    expect(formatDateTime('2026-11-25T08:00:00Z', 'vi')).not.toBe('—');

    expect(getFitStatusMeta('FLAT_FOOT', 'en').label).toBe('Flat-Foot Both Sides');
    expect(getFitStatusMeta('FLAT_FOOT', 'vi').label).toBe('Chống cả bàn chân');

    expect(getSagStatusMeta('OPTIMAL', 'en').label).toBe('Optimal Rider Sag');
    expect(getSagStatusMeta('OPTIMAL', 'vi').label).toBe('Sag tối ưu');

    expect(getCategoryLabel('ENDURO', 'en')).toBe('Enduro (Technical Trail)');
    expect(getCategoryLabel('ENDURO', 'vi')).toBe('Enduro (Địa hình kỹ thuật)');

    expect(getOrderStatusMeta('DEPOSIT_PAID', 'en').label).toBe('Deposit Paid');
    expect(getOrderStatusMeta('DEPOSIT_PAID', 'vi').label).toBe('Đã đặt cọc');

    expect(getShowroomMeta('HN_LONG_BIEN', 'en').name).toBe('DirtFit Hanoi — Long Bien');
    expect(getShowroomMeta('HN_LONG_BIEN', 'vi').name).toBe('DirtFit Hà Nội — Long Biên');
  });
});
