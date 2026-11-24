'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import BikeCard from '@/components/ui/BikeCard';
import { apiRequest } from '@/lib/api-client';
import { useRiderProfile } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

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
  const { t } = useI18n();

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
              {t('common.search')}
            </label>
            <input
              type="text"
              placeholder="KTM, CRF300L..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              {t('adminBikeDetail.fields.category')}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink"
            >
              <option value="">{t('catalog.allCategories')}</option>
              <option value="MOTOCROSS">{t('enums.categories.MOTOCROSS')}</option>
              <option value="ENDURO">{t('enums.categories.ENDURO')}</option>
              <option value="DUAL_SPORT">{t('enums.categories.DUAL_SPORT')}</option>
              <option value="ADVENTURE">{t('enums.categories.ADVENTURE')}</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              {t('quickFit.terrainLabel')}
            </label>
            <select
              value={ridingFocus}
              onChange={(e) => setRidingFocus(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink"
            >
              <option value="">{t('quickFit.allTerrains')}</option>
              <option value="OFF_ROAD">{t('enums.ridingFocus.OFF_ROAD')}</option>
              <option value="ON_OFF_MIXED">{t('enums.ridingFocus.ON_OFF_MIXED')}</option>
              <option value="ON_ROAD_ADV">{t('enums.ridingFocus.ON_ROAD_ADV')}</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              {t('catalog.brandLabel')}
            </label>
            <select
              value={brandSlug}
              onChange={(e) => setBrandSlug(e.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink"
            >
              <option value="">{t('catalog.allBrands')}</option>
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
              <span>
                {t('catalog.smartFitTitle')} (
                {fitEnabled ? t('catalog.enabled') : t('catalog.disabled')})
              </span>
            </button>
          </div>
        </div>

        {/* Collapsible Smart Rider-Fit Bar */}
        {fitEnabled && (
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                {t('catalog.heightCm')}
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
                {t('catalog.weightKg')}
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
                {t('catalog.bootsLabel')}
              </label>
              <select
                value={bootType}
                onChange={(e) => setBootType(e.target.value)}
                className="mt-1 w-full rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-sm"
              >
                <option value="MX_BOOTS">{t('enums.footwear.MX_BOOTS')}</option>
                <option value="ADV_BOOTS">{t('enums.footwear.ADV_BOOTS')}</option>
                <option value="SNEAKERS">{t('enums.footwear.SNEAKERS')}</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                {t('catalog.fitFilterLabel')}
              </label>
              <select
                value={fitFilter}
                onChange={(e) => setFitFilter(e.target.value)}
                className="mt-1 w-full rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-sm"
              >
                <option value="ALL">{t('catalog.fitOptions.ALL')}</option>
                <option value="FIT_WITH_MODS">{t('catalog.fitOptions.FIT_WITH_MODS')}</option>
                <option value="FIT_NOW">{t('catalog.fitOptions.FIT_NOW')}</option>
                <option value="BALLS_OF_FEET">{t('catalog.fitOptions.BALLS_OF_FEET')}</option>
                <option value="FLAT_FOOT">{t('catalog.fitOptions.FLAT_FOOT')}</option>
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
                <span>{t('catalog.fitOptions.FIT_WITH_MODS')}</span>
              </label>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-semibold text-ink-muted underline hover:text-ink"
              >
                {t('common.clearFilters')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-ink-secondary">
        <span className="font-semibold text-ink tabular-telemetry">
          {t('catalog.countResults', { count: bikes.length })}
          {fitEnabled
            ? ` · ${t('catalog.activeProfileNote', { height: heightCm, weight: weightKg })}`
            : ''}
        </span>
        {loading && <span className="text-signal">{t('catalog.calculating')}</span>}
      </div>

      {/* Bike Grid */}
      {bikes.length === 0 ? (
        <div className="border border-line bg-surface p-10 text-center text-sm text-ink-secondary">
          {t('catalog.emptyState')}
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
