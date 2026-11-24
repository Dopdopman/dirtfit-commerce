'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import BikeCard from '@/components/ui/BikeCard';
import { apiRequest } from '@/lib/api-client';
import { useRiderProfile } from '@/providers/AppProviders';

/**
 * Interactive Dual Filter Catalog: Terrain/Category/Brand + Smart Rider-Fit Filter.
 * @param {object} props
 * @param {Array<object>} props.initialBikes
 * @param {Array<object>} props.brands
 * @returns {import('react').JSX.Element}
 */
export default function BikeCatalogClient({ initialBikes, brands }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { riderProfile, setRiderProfile } = useRiderProfile();

  const initialHasFit = searchParams.has('heightCm') || searchParams.has('riderHeightCm');

  const [category, setCategory] = useState(searchParams.get('category') ?? '');
  const [ridingFocus, setRidingFocus] = useState(searchParams.get('ridingFocus') ?? '');
  const [brandSlug, setBrandSlug] = useState(searchParams.get('brandSlug') ?? '');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [fitEnabled, setFitEnabled] = useState(initialHasFit);
  const [heightCm, setHeightCm] = useState(
    Number(
      searchParams.get('heightCm') ?? searchParams.get('riderHeightCm') ?? riderProfile.heightCm
    )
  );
  const [weightKg, setWeightKg] = useState(
    Number(
      searchParams.get('weightKg') ?? searchParams.get('riderWeightKg') ?? riderProfile.weightKg
    )
  );
  const [bootType, setBootType] = useState(
    searchParams.get('bootType') ?? searchParams.get('footwear') ?? riderProfile.footwear
  );
  const [fitFilter, setFitFilter] = useState(searchParams.get('fitFilter') ?? 'ALL');
  const [includeModdable, setIncludeModdable] = useState(
    searchParams.get('includeModdable') !== 'false'
  );

  const [bikes, setBikes] = useState(initialBikes);
  const [loading, setLoading] = useState(false);

  const fetchFilteredBikes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '24');
      if (category) params.set('category', category);
      if (ridingFocus) params.set('ridingFocus', ridingFocus);
      if (brandSlug) params.set('brandSlug', brandSlug);
      if (search.trim()) params.set('search', search.trim());

      if (fitEnabled) {
        params.set('heightCm', String(heightCm));
        params.set('weightKg', String(weightKg));
        params.set('bootType', bootType);
        params.set('fitFilter', fitFilter);
        params.set('includeModdable', String(includeModdable));
        setRiderProfile({ heightCm, weightKg, footwear: bootType });
      }

      const data = await apiRequest(`/api/v1/bikes?${params.toString()}`);
      setBikes(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [
    category,
    ridingFocus,
    brandSlug,
    search,
    fitEnabled,
    heightCm,
    weightKg,
    bootType,
    fitFilter,
    includeModdable,
    setRiderProfile,
  ]);

  useEffect(() => {
    fetchFilteredBikes();
  }, [fetchFilteredBikes]);

  const handleReset = () => {
    setCategory('');
    setRidingFocus('');
    setBrandSlug('');
    setSearch('');
    setFitEnabled(false);
    setFitFilter('ALL');
    router.replace('/bikes');
  };

  return (
    <div className="space-y-6">
      {/* Filter Workbench */}
      <div className="border border-line bg-surface p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Tìm theo tên / SKU
            </label>
            <input
              type="text"
              placeholder="Ví dụ: KTM, CRF300L..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Phân khúc xe
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink"
            >
              <option value="">Tất cả phân khúc</option>
              <option value="MOTOCROSS">Motocross</option>
              <option value="ENDURO">Enduro</option>
              <option value="DUAL_SPORT">Dual-Sport</option>
              <option value="ADVENTURE">Adventure</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Địa hình vận hành
            </label>
            <select
              value={ridingFocus}
              onChange={(e) => setRidingFocus(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink"
            >
              <option value="">Tất cả địa hình</option>
              <option value="OFF_ROAD">Chuyên Off-Road</option>
              <option value="ON_OFF_MIXED">On / Off-Road Hỗn hợp</option>
              <option value="ON_ROAD_ADV">On-Road / Adventure</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Hãng sản xuất
            </label>
            <select
              value={brandSlug}
              onChange={(e) => setBrandSlug(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink"
            >
              <option value="">Tất cả hãng</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.slug}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setFitEnabled((v) => !v)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-sm border px-3 py-2 text-sm font-semibold transition-colors ${
                fitEnabled
                  ? 'border-signal bg-signal text-surface'
                  : 'border-line-strong bg-canvas text-ink hover:bg-ink hover:text-surface'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>{fitEnabled ? 'Đang lọc Rider-Fit' : 'Lọc theo vóc dáng'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Smart Rider-Fit Bar */}
        {fitEnabled && (
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Chiều cao (cm)
              </label>
              <input
                type="number"
                min={135}
                max={220}
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value) || 168)}
                className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-1.5 text-sm font-semibold tabular-telemetry"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Cân nặng (kg)
              </label>
              <input
                type="number"
                min={35}
                max={160}
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value) || 65)}
                className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-1.5 text-sm font-semibold tabular-telemetry"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Giày bảo hộ
              </label>
              <select
                value={bootType}
                onChange={(e) => setBootType(e.target.value)}
                className="mt-1 w-full rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-sm"
              >
                <option value="MX_BOOTS">MX Boots</option>
                <option value="ADV_BOOTS">ADV Boots</option>
                <option value="SNEAKERS">Giày thường</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Ngưỡng chống chân
              </label>
              <select
                value={fitFilter}
                onChange={(e) => setFitFilter(e.target.value)}
                className="mt-1 w-full rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-sm"
              >
                <option value="ALL">Xếp hạng tất cả theo Fit Score</option>
                <option value="FIT_WITH_MODS">Chống chân ổn (kể cả khi lắp hạ yên)</option>
                <option value="FIT_NOW">Chống chân được ngay ở cấu hình zin</option>
                <option value="BALLS_OF_FEET">Từ ức bàn chân trở lên</option>
                <option value="FLAT_FOOT">Chỉ xe chống phẳng cả bàn chân</option>
              </select>
            </div>

            <div className="sm:col-span-3 flex items-center justify-between gap-2 pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={includeModdable}
                  onChange={(e) => setIncludeModdable(e.target.checked)}
                  className="h-4 w-4 accent-signal"
                />
                <span>Gồm xe lắp kit hạ phuộc</span>
              </label>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-semibold text-ink-muted underline hover:text-ink"
              >
                Xóa lọc
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-ink-secondary">
        <span>
          Hiển thị <strong className="text-ink tabular-telemetry">{bikes.length}</strong> mẫu xe
          {fitEnabled ? ' (đã sắp xếp theo Fit Score giảm dần)' : ''}
        </span>
        {loading && <span className="text-signal">Đang tính toán vóc dáng...</span>}
      </div>

      {/* Bike Grid */}
      {bikes.length === 0 ? (
        <div className="border border-line bg-surface p-10 text-center text-sm text-ink-secondary">
          Không tìm thấy mẫu xe phù hợp bộ lọc hiện tại. Hãy nới lỏng ngưỡng chống chân hoặc bật tùy
          chọn kèm kit hạ yên.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {bikes.map((bike) => (
            <BikeCard key={bike.id} bike={bike} />
          ))}
        </div>
      )}
    </div>
  );
}
