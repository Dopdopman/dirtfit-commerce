'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Wrench, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { formatVnd } from '@/lib/formatters';
import { getAccessoryCardMedia } from '@/lib/media-helpers';
import { useCart } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Accessories catalog with real studio product photos, Technical SKU fallback,
 * `?sku=...` deep-link highlight + auto-scroll, and category/compatible bike/stock filtering.
 * @param {object} props
 * @param {Array<object>} props.initialAccessories
 * @param {Array<object>} props.bikes
 * @param {string} [props.initialSku]
 * @returns {import('react').JSX.Element}
 */
export default function AccessoriesClient({ initialAccessories, bikes, initialSku = '' }) {
  const router = useRouter();
  const { addItem } = useCart();
  const { locale, dict, t } = useI18n();
  const [category, setCategory] = useState('');
  const [bikeId, setBikeId] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [activeSku, setActiveSku] = useState(initialSku);
  const [items, setItems] = useState(initialAccessories);
  const [loading, setLoading] = useState(false);
  const [failedPhotoIds, setFailedPhotoIds] = useState(() => new Set());
  const isInitialMountRef = useRef(true);
  const highlightedCardRef = useRef(null);

  useEffect(() => {
    setActiveSku(initialSku);
  }, [initialSku]);

  const loadAccessories = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (category) params.set('category', category);
      if (bikeId) params.set('bikeId', bikeId);
      if (inStockOnly) params.set('inStock', 'true');
      if (search.trim()) params.set('search', search.trim());
      const data = await apiRequest(`/api/v1/accessories?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
      setFailedPhotoIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [category, bikeId, inStockOnly, search]);

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    loadAccessories();
  }, [loadAccessories]);

  const displayedItems = useMemo(() => {
    if (!activeSku) {
      return items;
    }
    const targetLower = activeSku.trim().toLowerCase();
    return items.filter(
      (acc) =>
        String(acc.sku || '')
          .trim()
          .toLowerCase() === targetLower
    );
  }, [items, activeSku]);

  useEffect(() => {
    if (!activeSku || displayedItems.length === 0 || !highlightedCardRef.current) {
      return;
    }
    highlightedCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeSku, displayedItems.length]);

  const handleClearSkuFocus = () => {
    setActiveSku('');
    setSearch('');
    router.replace('/accessories', { scroll: false });
  };

  const markImageFailed = (accId) => {
    setFailedPhotoIds((prev) => {
      const next = new Set(prev);
      next.add(accId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 border border-line bg-surface p-4 sm:grid-cols-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            {t('common.search')}
          </label>
          <input
            type="text"
            placeholder={t('accessories.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              if (activeSku) {
                setActiveSku('');
              }
              setSearch(e.target.value);
            }}
            className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            {t('adminAccessories.colType')}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
          >
            <option value="">{t('accessories.allCategories')}</option>
            {Object.entries(dict.enums.accessoryCategory).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            {t('accessories.filterByBike')}
          </label>
          <select
            value={bikeId}
            onChange={(e) => setBikeId(e.target.value)}
            className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
          >
            <option value="">{t('accessories.allBikes')}</option>
            {bikes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end pb-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="h-4 w-4 accent-signal"
            />
            <span>{t('accessories.inStockOnly')}</span>
          </label>
        </div>
      </div>

      {activeSku && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-signal bg-signal-soft px-4 py-3 text-xs">
          <span className="font-mono font-semibold text-ink">
            {t('accessories.focusedSkuBanner', { sku: activeSku })}
          </span>
          <button
            type="button"
            onClick={handleClearSkuFocus}
            className="inline-flex items-center gap-1 rounded-sm border border-line-strong bg-surface px-3 py-1 font-semibold text-ink transition-colors hover:border-signal hover:text-signal"
          >
            <X className="h-3.5 w-3.5" />
            <span>{t('accessories.showAllBtn')}</span>
          </button>
        </div>
      )}

      {loading && <div className="text-xs text-signal">{t('common.loading')}</div>}

      {displayedItems.length === 0 ? (
        <div className="space-y-3 border border-line bg-surface p-8 text-center text-sm text-ink-secondary">
          <p>
            {activeSku ? t('accessories.skuNotFound', { sku: activeSku }) : t('accessories.empty')}
          </p>
          {activeSku && (
            <button
              type="button"
              onClick={handleClearSkuFocus}
              className="rounded-sm border border-line-strong bg-canvas px-4 py-1.5 text-xs font-semibold text-ink hover:border-signal hover:text-signal"
            >
              {t('accessories.showAllBtn')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {displayedItems.map((acc) => {
            const media = getAccessoryCardMedia(acc);
            const showRealPhoto = Boolean(media.imageUrl && !failedPhotoIds.has(acc.id));
            const isHighlighted = Boolean(
              activeSku &&
              String(acc.sku || '')
                .trim()
                .toLowerCase() === activeSku.trim().toLowerCase()
            );

            return (
              <div
                key={acc.id}
                ref={isHighlighted ? highlightedCardRef : undefined}
                data-highlighted-sku={isHighlighted ? acc.sku : undefined}
                className={`flex flex-col justify-between border bg-surface transition-shadow ${
                  isHighlighted ? 'border-signal ring-1 ring-signal shadow-md' : 'border-line'
                }`}
              >
                <div>
                  {/* Studio 4:3 Product Photo or Technical SKU Fallback Card */}
                  <div
                    className={`relative aspect-[4/3] w-full overflow-hidden border-b border-line ${
                      showRealPhoto ? 'bg-canvas' : 'cad-grid-bg'
                    }`}
                  >
                    {showRealPhoto ? (
                      <img
                        src={media.imageUrl}
                        alt={acc.name}
                        loading="lazy"
                        onError={() => markImageFailed(acc.id)}
                        className="h-full w-full object-contain p-3"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col justify-between p-4">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                          <span>{t('accessories.technicalPartTag')}</span>
                          <Wrench className="h-4 w-4 text-signal" />
                        </div>
                        <div className="my-auto text-center">
                          <div className="font-mono text-sm font-bold tracking-tight text-ink">
                            {acc.sku}
                          </div>
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                            {acc.brandName ?? 'OEM'}
                          </div>
                        </div>
                        <div className="text-[10px] font-mono uppercase text-ink-muted">
                          {dict.enums.accessoryCategory[acc.category] ?? acc.category}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-5 pb-0">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                      <span>{dict.enums.accessoryCategory[acc.category] ?? acc.category}</span>
                      <span className="tabular-telemetry">{acc.brandName ?? 'OEM'}</span>
                    </div>
                    <h3 className="mt-2 font-display text-lg font-bold text-ink">{acc.name}</h3>
                    <p className="mt-1 font-mono text-xs text-ink-secondary">SKU: {acc.sku}</p>

                    {acc.ergoImpactJson && (
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-signal tabular-telemetry">
                        {acc.ergoImpactJson.loweringLinkMm ? (
                          <span className="rounded-sm border border-signal/30 bg-orange-50 px-2 py-0.5">
                            {t('accessories.ergoEffects.loweringLinkMm', {
                              val: acc.ergoImpactJson.loweringLinkMm,
                            })}
                          </span>
                        ) : null}
                        {acc.ergoImpactJson.lowSeatMm ? (
                          <span className="rounded-sm border border-signal/30 bg-orange-50 px-2 py-0.5">
                            {t('accessories.ergoEffects.lowSeatMm', {
                              val: acc.ergoImpactJson.lowSeatMm,
                            })}
                          </span>
                        ) : null}
                        {acc.ergoImpactJson.barRiserMm ? (
                          <span className="rounded-sm border border-signal/30 bg-orange-50 px-2 py-0.5">
                            {t('accessories.ergoEffects.barRiserMm', {
                              val: acc.ergoImpactJson.barRiserMm,
                            })}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-center justify-between border-t border-line pt-4">
                    <div>
                      <div className="text-base font-bold text-ink tabular-telemetry">
                        {formatVnd(acc.priceVnd, locale)}
                      </div>
                      <div className="text-[11px] text-ink-muted tabular-telemetry">
                        {acc.availableQty > 0
                          ? t('common.unitsLeft', { count: acc.availableQty })
                          : t('common.outOfStock')}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={acc.availableQty <= 0}
                      onClick={() =>
                        addItem({ itemType: 'ACCESSORY', accessoryId: acc.id, quantity: 1 })
                      }
                      className="inline-flex items-center gap-1.5 rounded-sm bg-ink px-3.5 py-2 text-xs font-semibold text-surface hover:bg-signal disabled:opacity-40"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      <span>{t('accessories.addToCart')}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
