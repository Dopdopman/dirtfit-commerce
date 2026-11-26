import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import StorefrontShell from '@/components/layout/StorefrontShell';
import { getServerLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/translate';
import AppProviders from '@/providers/AppProviders';
import I18nProvider from '@/providers/I18nProvider';
import './globals.css';

/**
 * Dynamic SSR metadata aligned with active `dirtfit_locale` cookie (default: 'en').
 * @returns {Promise<import('next').Metadata>}
 */
export async function generateMetadata() {
  const locale = await getServerLocale();
  const dict = getDictionary(locale);
  return {
    title: dict.meta.siteTitle,
    description: dict.meta.siteDescription,
    manifest: '/manifest.webmanifest',
  };
}

/**
 * Root App Router layout loading 3 multilingual fonts, SSR locale, and providers.
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function RootLayout({ children }) {
  const locale = await getServerLocale();

  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col bg-canvas text-ink">
        <I18nProvider initialLocale={locale}>
          <AppProviders>
            <StorefrontShell>{children}</StorefrontShell>
          </AppProviders>
        </I18nProvider>
      </body>
    </html>
  );
}
