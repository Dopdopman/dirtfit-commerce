'use client';

import Link from 'next/link';
import { FOOTER_POLICY_LINKS } from '@dirtfit/knowledge/constants';
import { SHOWROOMS } from '@dirtfit/shared/enums';
import BrandLogo from '@/components/ui/BrandLogo';
import { getShowroomMeta } from '@/lib/formatters';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Clean Industrial Motorsport footer listing localized showrooms, quick links, and policy docs.
 * @returns {import('react').JSX.Element}
 */
export default function SiteFooter() {
  const { locale, t } = useI18n();

  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1360px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-12">
        <div className="md:col-span-4">
          <Link href="/" className="inline-flex items-center">
            <BrandLogo variant="full" size="sm" subtitle="COMMERCE" />
          </Link>
          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
            {t('footer.description')}
          </p>
        </div>

        <div className="md:col-span-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            {t('footer.showroomsTitle')}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-secondary">
            {SHOWROOMS.map((s) => {
              const meta = getShowroomMeta(s.code, locale);
              return (
                <li key={s.code} className="flex flex-col">
                  <span className="font-medium text-ink">{meta.name}</span>
                  <span className="text-xs text-ink-muted">{meta.address}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="md:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            {t('footer.quickLinksTitle')}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-secondary">
            <li>
              <Link href="/bikes" className="hover:text-signal">
                {t('footer.links.bikes')}
              </Link>
            </li>
            <li>
              <Link href="/compare" className="hover:text-signal">
                {t('footer.links.compare')}
              </Link>
            </li>
            <li>
              <Link href="/accessories" className="hover:text-signal">
                {t('footer.links.accessories')}
              </Link>
            </li>
            <li>
              <Link href="/test-ride" className="hover:text-signal">
                {t('footer.links.testRide')}
              </Link>
            </li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            {t('footer.policiesTitle')}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-secondary">
            {FOOTER_POLICY_LINKS.map((item) => (
              <li key={item.slug}>
                <Link href={item.href} className="hover:text-signal">
                  {t(item.i18nKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-line bg-canvas px-4 py-4 text-center text-xs text-ink-muted">
        {t('footer.bottomNote')}
      </div>
    </footer>
  );
}
