import GhostCompareWorkbench from '@/components/simulator/GhostCompareWorkbench';
import { fetchServerApi } from '@/lib/api-client';
import { getServerLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';

/**
 * Independent 2-Bike Ghost Overlay Comparison Page.
 * @param {object} context
 * @param {Promise<Record<string, string>>} context.searchParams
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function ComparePage({ searchParams }) {
  const [resolvedSearch, locale, res] = await Promise.all([
    searchParams,
    getServerLocale(),
    fetchServerApi('/api/v1/bikes?limit=24', { revalidate: 60 }),
  ]);
  const dict = getDictionary(locale);
  const bikes = res?.data ?? [];

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6">
      <div className="mb-6 border-b border-line pb-4">
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          {dict.compare.kicker}
        </div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink">
          {dict.compare.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-secondary">{dict.compare.subtitle}</p>
      </div>

      <GhostCompareWorkbench
        bikes={bikes}
        initialSlugA={resolvedSearch?.bikeA ?? 'honda-crf300l'}
        initialSlugB={resolvedSearch?.bikeB ?? 'ktm-350-exc-f'}
      />
    </div>
  );
}
