import { notFound } from 'next/navigation';
import BikeDetailClient from '@/components/catalog/BikeDetailClient';
import { fetchServerApi } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

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
