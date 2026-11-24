'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, ShoppingBag, User } from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo';
import LocaleToggle from '@/components/ui/LocaleToggle';
import { canAccessAdminPortal } from '@/lib/admin-helpers';
import { useAuth, useCart } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Industrial Motorsport top navigation bar with opaque surface, custom BrandLogo,
 * live cart counter, locale switcher (EN | VI), and Admin/Account indicator.
 * @returns {import('react').JSX.Element}
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const { user, authReady } = useAuth();
  const { cart } = useCart();
  const { t } = useI18n();
  const itemCount = cart?.itemCount ?? 0;

  const navItems = [
    { href: '/bikes', label: t('nav.bikes') },
    { href: '/compare', label: t('nav.compare') },
    { href: '/accessories', label: t('nav.accessories') },
    { href: '/test-ride', label: t('nav.testRide') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#E3E3DC] bg-[#F7F7F5]">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center">
            <BrandLogo variant="full" size="md" subtitle="2D SPEC" />
          </Link>

          <nav aria-label={t('nav.mainNavLabel')} className="hidden items-center gap-6 md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-medium transition-colors ${
                    active ? 'text-signal' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <LocaleToggle />

          {authReady && user && canAccessAdminPortal(user.role) && (
            <Link
              href="/admin"
              className="hidden items-center gap-1.5 rounded-sm border border-signal bg-signal-soft px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-signal transition-colors hover:bg-signal hover:text-surface md:flex"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('nav.adminPortal')}
            </Link>
          )}

          <Link
            href="/cart"
            className="flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-line-strong"
          >
            <ShoppingBag className="h-4 w-4 text-ink-secondary" />
            <span className="hidden sm:inline">{t('nav.cart')}</span>
            <span className="rounded-sm bg-ink px-1.5 py-0.5 text-xs font-semibold text-surface tabular-telemetry">
              {itemCount}
            </span>
          </Link>

          {authReady && user ? (
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
            >
              <User className="h-4 w-4 text-signal" />
              <span className="max-w-[110px] truncate">{user.fullName}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-sm bg-ink px-3.5 py-1.5 text-sm font-medium text-surface transition-colors hover:bg-signal"
            >
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>

      <nav
        aria-label={t('nav.mobileNavLabel')}
        className="flex items-center justify-between gap-4 overflow-x-auto border-t border-[#E3E3DC] bg-[#F7F7F5] px-4 py-2 text-xs font-medium md:hidden"
      >
        <div className="flex items-center gap-4">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap ${active ? 'text-signal' : 'text-ink-secondary'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        {authReady && user && canAccessAdminPortal(user.role) && (
          <Link href="/admin" className="whitespace-nowrap font-semibold text-signal">
            {t('nav.adminPortal')}
          </Link>
        )}
      </nav>
    </header>
  );
}
