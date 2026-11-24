import { Be_Vietnam_Pro, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import StorefrontShell from '@/components/layout/StorefrontShell';
import { getServerLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/translate';
import AppProviders from '@/providers/AppProviders';
import I18nProvider from '@/providers/I18nProvider';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

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
    <html
      lang={locale}
      className={`${plusJakartaSans.variable} ${beVietnamPro.variable} ${jetBrainsMono.variable}`}
    >
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
