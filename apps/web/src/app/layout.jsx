import { Be_Vietnam_Pro, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import StorefrontShell from '@/components/layout/StorefrontShell';
import AppProviders from '@/providers/AppProviders';
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

export const metadata = {
  title: 'DirtFit Commerce — Xe Máy Địa Hình & Mô Phỏng Vóc Dáng 2D',
  description:
    'Nền tảng thương mại điện tử chuyên xe máy địa hình Enduro, Dual-Sport, Motocross, Adventure kèm 2D Parametric Rider Fit Simulator.',
};

/**
 * Root App Router layout loading 3 Vietnamese-ready fonts and Storefront providers.
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @returns {import('react').JSX.Element}
 */
export default function RootLayout({ children }) {
  return (
    <html
      lang="vi"
      className={`${plusJakartaSans.variable} ${beVietnamPro.variable} ${jetBrainsMono.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-canvas text-ink">
        <AppProviders>
          <StorefrontShell>{children}</StorefrontShell>
        </AppProviders>
      </body>
    </html>
  );
}
