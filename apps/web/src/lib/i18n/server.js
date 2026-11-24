import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, normalizeLocale } from './config.js';

/**
 * Read active user locale on Next.js Server Components via cookie (`dirtfit_locale`).
 * Defaults cleanly to 'en' without throwing during static fallback.
 * @returns {Promise<'en'|'vi'>}
 */
export async function getServerLocale() {
  try {
    const cookieStore = await cookies();
    return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  } catch {
    return 'en';
  }
}
