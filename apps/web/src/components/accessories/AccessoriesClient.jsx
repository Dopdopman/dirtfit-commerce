'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { formatVnd } from '@/lib/formatters';
import { useCart } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Accessories catalog with category, compatible bike, and stock filtering.
 * @param {object} props
 * @param {Array<object>} props.initialAccessories
 * @param {Array<object>} props.bikes
 * @returns {import('react').JSX.Element}
 */
export default function AccessoriesClient({ initialAccessories, bikes }) {
  const { addItem } = useCart();
  const { locale, dict, t } = useI18n();
  const [category, setCategory] = useState('');
  const [bikeId, setBikeId] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState(initialAccessories);
  const [loading, setLoading] = useState(false);

  const loadAccessories = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '24' });
      if (category) params.set('category', category);
      if (bikeId) params.set('bikeId', bikeId);
      if (inStockOnly) params.set('inStock', 'true');
      if (search.trim()) params.set('search', search.trim());
      const data = await apiRequest(`/api/v1/accessories?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [category, bikeId, inStockOnly, search]);

  useEffect(() => {
    loadAccessories();
  }, [loadAccessories]);

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
            onChange={(e) => setSearch(e.target.value)}
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

      {loading && <div className="text-xs text-signal">{t('common.loading')}</div>}

      {items.length === 0 ? (
        <div className="border border-line bg-surface p-8 text-center text-sm text-ink-secondary">
          {t('accessories.empty')}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((acc) => (
            <div
              key={acc.id}
              className="flex flex-col justify-between border border-line bg-surface p-5"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  <span>{dict.enums.accessoryCategory[acc.category] ?? acc.category}</span>
                  <span className="tabular-telemetry">{acc.brandName ?? 'OEM'}</span>
                </div>
                <h3 className="mt-2 font-display text-lg font-bold text-ink">{acc.name}</h3>
                <p className="mt-1 text-xs text-ink-secondary">SKU: {acc.sku}</p>

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

              <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
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
          ))}
        </div>
      )}
    </div>
  );
}
