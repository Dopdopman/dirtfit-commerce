'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, normalizeLocale } from '@/lib/i18n/config';
import { getDictionary, translate } from '@/lib/i18n/translate';

const I18nContext = createContext(null);

/**
 * Client-side localization provider synchronized with SSR `dirtfit_locale` cookie.
 * Updates document language attribute and invokes `router.refresh()` cleanly without full reload.
 * @param {object} props
 * @param {'en'|'vi'} [props.initialLocale]
 * @param {import('react').ReactNode} props.children
 * @returns {import('react').JSX.Element}
 */
export default function I18nProvider({ initialLocale = DEFAULT_LOCALE, children }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState(() => normalizeLocale(initialLocale));

  useEffect(() => {
    setLocaleState(normalizeLocale(initialLocale));
  }, [initialLocale]);

  const setLocale = useCallback(
    (nextLocale) => {
      const normalized = normalizeLocale(nextLocale);
      if (normalized === locale) {
        return;
      }
      if (typeof document !== 'undefined') {
        document.cookie = `${LOCALE_COOKIE_NAME}=${normalized}; Path=/; SameSite=Lax; Max-Age=31536000`;
        document.documentElement.lang = normalized;
      }
      setLocaleState(normalized);
      router.refresh();
    },
    [locale, router]
  );

  const value = useMemo(() => {
    const dict = getDictionary(locale);
    return {
      locale,
      setLocale,
      dict,
      t: (key, params) => translate(locale, key, params),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Access active locale (`'en'|'vi'`), `setLocale`, `dict`, and `t(key, params)`.
 * @returns {{
 *   locale: 'en'|'vi',
 *   setLocale: (next: 'en'|'vi') => void,
 *   dict: object,
 *   t: (key: string, params?: Record<string, string|number>) => string
 * }}
 */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
