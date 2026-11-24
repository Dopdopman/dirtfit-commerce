import GhostCompareWorkbench from '@/components/simulator/GhostCompareWorkbench';
import { fetchServerApi } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

/**
 * Independent 2-Bike Ghost Overlay Comparison Page.
 * @param {object} context
 * @param {Promise<Record<string, string>>} context.searchParams
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function ComparePage({ searchParams }) {
  const resolvedSearch = await searchParams;
  const res = await fetchServerApi('/api/v1/bikes?limit=24', { revalidate: 60 });
  const bikes = res?.data ?? [];

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6">
      <div className="mb-6 border-b border-line pb-4">
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          GHOST OVERLAY COMPARISON · TỶ LỆ 1:1 MILIMÉT
        </div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink">
          So sánh công thái học 2 mẫu xe
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
          Chồng hai khung xe theo chuẩn trục bánh sau hoặc hõm yên ngồi trên cùng một thể trạng để
          nhìn rõ chênh lệch tầm với tay lái, độ rộng yên và độ cao yên thực tế.
        </p>
      </div>

      <GhostCompareWorkbench
        bikes={bikes}
        initialSlugA={resolvedSearch?.bikeA ?? 'honda-crf300l'}
        initialSlugB={resolvedSearch?.bikeB ?? 'ktm-350-exc-f'}
      />
    </div>
  );
}
