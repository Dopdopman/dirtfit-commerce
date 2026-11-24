import AccessoriesClient from '@/components/accessories/AccessoriesClient';
import { fetchServerApi } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

/**
 * Storefront Accessories & Lowering Kits Catalog Page.
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function AccessoriesPage() {
  const [accRes, bikesRes] = await Promise.all([
    fetchServerApi('/api/v1/accessories?limit=24', { revalidate: 30 }),
    fetchServerApi('/api/v1/bikes?limit=24', { revalidate: 60 }),
  ]);

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6">
      <div className="mb-6 border-b border-line pb-4">
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          PHỤ TÙNG HẠ YÊN & BẢO HỘ ĐỊA HÌNH
        </div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink">
          Phụ kiện nâng cấp công thái học
        </h1>
      </div>

      <AccessoriesClient initialAccessories={accRes?.data ?? []} bikes={bikesRes?.data ?? []} />
    </div>
  );
}
