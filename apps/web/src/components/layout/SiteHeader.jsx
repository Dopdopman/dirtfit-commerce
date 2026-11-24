'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, ShieldCheck, User } from 'lucide-react';
import { canAccessAdminPortal } from '@/lib/admin-helpers';
import { useAuth, useCart } from '@/providers/AppProviders';

const NAV_ITEMS = [
  { href: '/bikes', label: 'Danh mục xe' },
  { href: '/compare', label: 'So sánh Ghost' },
  { href: '/accessories', label: 'Phụ kiện' },
  { href: '/test-ride', label: 'Đặt lịch lái thử' },
];

/**
 * Industrial Motorsport top navigation bar with live cart counter and account indicator.
 * @returns {import('react').JSX.Element}
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const { user, authReady } = useAuth();
  const { cart } = useCart();
  const itemCount = cart?.itemCount ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="inline-block h-3 w-3 bg-signal" aria-hidden="true" />
            <span className="font-display text-lg font-extrabold tracking-tight text-ink">
              DIRTFIT
            </span>
            <span className="hidden border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-ink-muted sm:inline-block tabular-telemetry">
              2D SPEC
            </span>
          </Link>

          <nav aria-label="Điều hướng chính" className="hidden items-center gap-6 md:flex">
            {NAV_ITEMS.map((item) => {
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

        <div className="flex items-center gap-2 sm:gap-3">
          {authReady && user && canAccessAdminPortal(user.role) && (
            <Link
              href="/admin"
              className="hidden items-center gap-1.5 rounded-sm border border-signal bg-signal-soft px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-signal transition-colors hover:bg-signal hover:text-surface md:flex"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin Portal
            </Link>
          )}

          <Link
            href="/cart"
            className="flex items-center gap-2 rounded-sm border border-line bg-canvas px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-line-strong"
          >
            <ShoppingBag className="h-4 w-4 text-ink-secondary" />
            <span className="hidden sm:inline">Giỏ hàng</span>
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
              <span className="max-w-[120px] truncate">{user.fullName}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-sm bg-ink px-3.5 py-1.5 text-sm font-medium text-surface transition-colors hover:bg-signal"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      </div>

      <nav
        aria-label="Điều hướng di động"
        className="flex items-center gap-4 overflow-x-auto border-t border-line px-4 py-2 text-xs font-medium md:hidden"
      >
        {NAV_ITEMS.map((item) => {
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
      </nav>
    </header>
  );
}
