import { Suspense } from 'react';
import BikeCatalogClient from '@/components/catalog/BikeCatalogClient';
import { fetchServerApi } from '@/lib/api-client';
import { getServerLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';

/**
 * Storefront Motorcycle Catalog Page with Dual Terrain + Smart Rider-Fit Filter.
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function BikesPage() {
  const [locale, bikesRes, brandsRes] = await Promise.all([
    getServerLocale(),
    fetchServerApi('/api/v1/bikes?limit=24', { revalidate: 30 }),
    fetchServerApi('/api/v1/brands', { revalidate: 300 }),
  ]);

  const dict = getDictionary(locale);
  const initialBikes = bikesRes?.data ?? [];
  const brands = brandsRes?.data?.brands ?? [];

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6">
      <div className="mb-6 border-b border-line pb-4">
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          {dict.catalog.kicker}
        </div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink">
          {dict.catalog.title}
        </h1>
      </div>

      <Suspense
        fallback={
          <div className="border border-line bg-surface p-8 text-sm text-ink-secondary">
            {dict.catalog.loadingFallback}
          </div>
        }
      >
        <BikeCatalogClient initialBikes={initialBikes} brands={brands} />
      </Suspense>
    </div>
  );
}
