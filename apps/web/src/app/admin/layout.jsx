'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bike,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo';
import LocaleToggle from '@/components/ui/LocaleToggle';
import { canAccessAdminOnlyFeature, canAccessAdminPortal } from '@/lib/admin-helpers';
import { useAuth } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

const ADMIN_NAV_ITEMS = [
  {
    href: '/admin',
    labelKey: 'adminLayout.nav.overview',
    icon: LayoutDashboard,
    exact: true,
    adminOnly: false,
  },
  {
    href: '/admin/bikes',
    labelKey: 'adminLayout.nav.bikes',
    icon: Bike,
    exact: false,
    adminOnly: false,
  },
  {
    href: '/admin/accessories',
    labelKey: 'adminLayout.nav.accessories',
    icon: Wrench,
    exact: false,
    adminOnly: false,
  },
  {
    href: '/admin/orders',
    labelKey: 'adminLayout.nav.orders',
    icon: Package,
    exact: false,
    adminOnly: false,
  },
  {
    href: '/admin/test-rides',
    labelKey: 'adminLayout.nav.testRides',
    icon: CalendarClock,
    exact: false,
    adminOnly: false,
  },
  {
    href: '/admin/audit-logs',
    labelKey: 'adminLayout.nav.auditLogs',
    icon: ClipboardList,
    exact: false,
    adminOnly: true,
  },
];

/**
 * Isolated Industrial Technical Dashboard layout for `/admin/*` routes.
 * Enforces UI-level RBAC guards (redirecting guests to `/login` and showing 403 for CUSTOMER).
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @returns {import('react').JSX.Element}
 */
export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authReady, logout } = useAuth();
  const { t } = useI18n();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (authReady && !user) {
      const nextTarget = pathname && pathname.startsWith('/admin') ? pathname : '/admin';
      router.replace(`/login?next=${encodeURIComponent(nextTarget)}`);
    }
  }, [authReady, user, pathname, router]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-sm border border-line bg-surface p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            {t('adminLayout.consoleTitle')}
          </p>
          <p className="mt-2 text-sm text-ink-secondary">{t('adminLayout.verifyingSession')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="rounded-sm border border-line bg-surface p-6 text-sm text-ink-secondary">
          {t('adminLayout.redirectingLogin')}
        </div>
      </div>
    );
  }

  if (!canAccessAdminPortal(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-lg rounded-sm border border-danger-border bg-surface p-8">
          <div className="flex items-center gap-3 text-danger">
            <ShieldAlert className="h-6 w-6" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest">
              {t('adminLayout.forbiddenCode')}
            </span>
          </div>
          <h1 className="mt-3 text-xl font-bold text-ink">{t('adminLayout.forbiddenTitle')}</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {t('adminLayout.forbiddenBody', { email: user.email, role: user.role })}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-signal"
            >
              {t('adminLayout.backStorefront')}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.push('/login?next=/admin');
              }}
              className="rounded-sm border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
            >
              {t('adminLayout.switchAccount')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const visibleNavItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.adminOnly || canAccessAdminOnlyFeature(user.role)
  );
  const isAuditRouteBlocked =
    pathname?.startsWith('/admin/audit-logs') && !canAccessAdminOnlyFeature(user.role);

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-line px-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <BrandLogo variant="mark" size="sm" />
            <div>
              <div className="text-sm font-bold tracking-tight text-ink">
                {t('adminLayout.consoleTitle')}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-signal">
                {user.role}
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Admin navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-sm border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-signal bg-signal-soft text-signal'
                    : 'border-transparent text-ink-secondary hover:border-line hover:bg-canvas hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2.5 border-t border-line p-3">
          <div className="flex items-center justify-between rounded-sm border border-line bg-canvas px-2.5 py-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              LOCALE
            </span>
            <LocaleToggle compact />
          </div>

          <div className="rounded-sm border border-line bg-canvas p-2.5">
            <p className="truncate text-xs font-semibold text-ink">{user.fullName}</p>
            <p className="truncate font-mono text-[11px] text-ink-muted">{user.email}</p>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-secondary hover:border-line-strong hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('adminLayout.backStorefront')}
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              className="rounded-sm border border-line p-2 text-ink lg:hidden"
              aria-label="Toggle admin menu"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">
                {t('adminLayout.consoleSubtitle')}
              </p>
              <p className="text-sm font-semibold text-ink">{t('adminLayout.headerHeadline')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="lg:hidden">
              <LocaleToggle compact />
            </div>
            <span className="hidden rounded-sm border border-line bg-canvas px-2.5 py-1 font-mono text-xs font-semibold text-ink sm:inline-block">
              {t('adminLayout.rolePrefix')}: {user.role}
            </span>
            <Link
              href="/"
              className="rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink hover:border-line-strong lg:hidden"
            >
              {t('adminLayout.shortStorefront')}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
              className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-danger hover:text-danger"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('adminLayout.signOut')}</span>
            </button>
          </div>
        </header>

        {mobileNavOpen && (
          <nav
            className="border-b border-line bg-surface p-3 lg:hidden"
            aria-label="Mobile admin nav"
          >
            <div className="grid grid-cols-2 gap-2">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-xs font-medium ${
                      active
                        ? 'border-signal bg-signal-soft text-signal'
                        : 'border-line bg-canvas text-ink-secondary'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        <main className="flex-1 p-4 sm:p-6">
          {isAuditRouteBlocked ? (
            <div className="mx-auto max-w-xl rounded-sm border border-danger-border bg-surface p-6">
              <div className="flex items-center gap-2 text-danger">
                <ShieldAlert className="h-5 w-5" />
                <span className="font-mono text-xs font-bold uppercase">
                  {t('adminLayout.auditOnlyCode')}
                </span>
              </div>
              <h2 className="mt-2 text-lg font-bold text-ink">{t('adminLayout.auditOnlyTitle')}</h2>
              <p className="mt-1 text-sm text-ink-secondary">{t('adminLayout.auditOnlyBody')}</p>
              <Link
                href="/admin"
                className="mt-4 inline-block rounded-sm bg-ink px-4 py-2 text-xs font-semibold text-surface hover:bg-signal"
              >
                {t('adminLayout.backDashboard')}
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
