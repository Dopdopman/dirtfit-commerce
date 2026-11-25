import AccessoriesClient from '@/components/accessories/AccessoriesClient';
import { fetchServerApi } from '@/lib/api-client';
import { getServerLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';

/**
 * Storefront Accessories & Lowering Kits Catalog Page.
 * Supports deep-link highlight via `?sku=ACC-...`.
 * @param {object} context
 * @param {Promise<Record<string, string|string[]|undefined>>} [context.searchParams]
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function AccessoriesPage({ searchParams }) {
  const [resolvedParams, locale, accRes, bikesRes] = await Promise.all([
    searchParams ?? Promise.resolve({}),
    getServerLocale(),
    fetchServerApi('/api/v1/accessories?limit=50', { revalidate: 0 }),
    fetchServerApi('/api/v1/bikes?limit=24', { revalidate: 0 }),
  ]);
  const dict = getDictionary(locale);
  const initialSku = typeof resolvedParams?.sku === 'string' ? resolvedParams.sku.trim() : '';

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6">
      <div className="mb-6 border-b border-line pb-4">
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          {dict.accessories.kicker}
        </div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink">
          {dict.accessories.title}
        </h1>
      </div>

      <AccessoriesClient
        initialAccessories={accRes?.data ?? []}
        bikes={bikesRes?.data ?? []}
        initialSku={initialSku}
      />
    </div>
  );
}
