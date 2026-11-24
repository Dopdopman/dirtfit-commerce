import { notFound } from 'next/navigation';
import BikeDetailClient from '@/components/catalog/BikeDetailClient';
import { fetchServerApi } from '@/lib/api-client';
import { getServerLocale } from '@/lib/i18n/server';
import { getBikeSummary, getDictionary } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';

/**
 * Dynamic localized metadata for motorcycle detail pages.
 * @param {object} context
 * @param {Promise<{ slug: string }>} context.params
 * @returns {Promise<import('next').Metadata>}
 */
export async function generateMetadata({ params }) {
  const [{ slug }, locale] = await Promise.all([params, getServerLocale()]);
  const res = await fetchServerApi(`/api/v1/bikes/${slug}`, { revalidate: 30 });
  const bike = res?.data?.bike;
  const dict = getDictionary(locale);
  if (!bike) {
    return { title: dict.meta.siteTitle };
  }
  return {
    title: `${bike.name} — ${dict.meta.bikeTitleSuffix}`,
    description: getBikeSummary(bike, locale),
  };
}

/**
 * Motorcycle Detail Page with 3-tier Progressive Disclosure & 60fps 2D Simulator.
 * @param {object} context
 * @param {Promise<{ slug: string }>} context.params
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function BikeDetailPage({ params }) {
  const { slug } = await params;
  const res = await fetchServerApi(`/api/v1/bikes/${slug}`, { revalidate: 30 });
  const bike = res?.data?.bike;

  if (!bike) {
    notFound();
  }

  return <BikeDetailClient bike={bike} />;
}
