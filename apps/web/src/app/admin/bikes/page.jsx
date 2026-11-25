'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { Edit3, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { BIKE_CATEGORIES, PRODUCT_STATUSES, RIDING_FOCUSES, USER_ROLES } from '@dirtfit/shared';
import ProductThumbnail from '@/components/ui/ProductThumbnail';
import { canAccessAdminOnlyFeature } from '@/lib/admin-helpers';
import { apiRequest } from '@/lib/api-client';
import { formatVnd, getCategoryLabel } from '@/lib/formatters';
import { localizeApiError } from '@/lib/i18n/translate';
import { useAuth } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

const INITIAL_NEW_BIKE = {
  brandId: '',
  sku: '',
  name: '',
  slug: '',
  modelYear: 2026,
  category: 'ENDURO',
  ridingFocus: 'OFF_ROAD',
  engineCc: 350,
  streetLegal: true,
  priceVnd: 280000000,
  depositAmountVnd: 15000000,
  stockQty: 3,
  status: 'ACTIVE',
  shortSummary: '',
  unladenSeatHeightMm: 955,
  seatWidthMm: 165,
  wheelbaseMm: 1485,
  groundClearanceMm: 355,
  frontWheelDiameterIn: 21,
  rearWheelDiameterIn: 18,
  frontTireOuterRadiusMm: 375,
  rearTireOuterRadiusMm: 355,
  frontTravelMm: 300,
  rearTravelMm: 310,
  staticSagRearMm: 35,
  staticSagFrontMm: 28,
  seatPocketXMm: 520,
  seatPocketYMm: 955,
  footpegXMm: 615,
  footpegYMm: 410,
  handlebarGripXMm: 960,
  handlebarGripYMm: 1190,
  wetWeightKg: 112,
};

/**
 * Admin & Sales Motorcycles inventory list (`/admin/bikes`).
 * Supports creating new bikes (ADMIN) and soft-deleting (ADMIN).
 * @returns {import('react').JSX.Element}
 */
export default function AdminBikesPage() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const isAdmin = canAccessAdminOnlyFeature(user?.role);

  const [bikes, setBikes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(INITIAL_NEW_BIKE);

  const loadBikes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ limit: '50' });
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter) qs.set('status', statusFilter);

      const [bikesRes, brandsRes] = await Promise.all([
        apiRequest(`/api/v1/admin/bikes?${qs.toString()}`),
        apiRequest('/api/v1/brands'),
      ]);
      setBikes(Array.isArray(bikesRes) ? bikesRes : []);
      const brandItems = brandsRes?.brands ?? [];
      setBrands(brandItems);
      if (brandItems.length > 0 && !form.brandId) {
        setForm((prev) => ({ ...prev, brandId: brandItems[0].id }));
      }
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, form.brandId, locale]);

  useEffect(() => {
    loadBikes();
  }, [loadBikes]);

  const handleCreateBike = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSubmitting(true);
    setError('');
    setFeedback('');
    try {
      const payload = {
        brandId: form.brandId,
        sku: form.sku.trim(),
        name: form.name.trim(),
        slug: form.slug.trim(),
        modelYear: Number(form.modelYear),
        category: form.category,
        ridingFocus: form.ridingFocus,
        engineCc: Number(form.engineCc),
        streetLegal: Boolean(form.streetLegal),
        priceVnd: Number(form.priceVnd),
        depositAmountVnd: Number(form.depositAmountVnd),
        stockQty: Number(form.stockQty),
        status: form.status,
        shortSummary: form.shortSummary.trim() || null,
        geometrySpec: {
          unladenSeatHeightMm: Number(form.unladenSeatHeightMm),
          seatWidthMm: Number(form.seatWidthMm),
          wheelbaseMm: Number(form.wheelbaseMm),
          groundClearanceMm: Number(form.groundClearanceMm),
          frontWheelDiameterIn: Number(form.frontWheelDiameterIn),
          rearWheelDiameterIn: Number(form.rearWheelDiameterIn),
          frontTireOuterRadiusMm: Number(form.frontTireOuterRadiusMm),
          rearTireOuterRadiusMm: Number(form.rearTireOuterRadiusMm),
          frontTravelMm: Number(form.frontTravelMm),
          rearTravelMm: Number(form.rearTravelMm),
          staticSagRearMm: Number(form.staticSagRearMm),
          staticSagFrontMm: Number(form.staticSagFrontMm),
          seatPocketXMm: Number(form.seatPocketXMm),
          seatPocketYMm: Number(form.seatPocketYMm),
          footpegXMm: Number(form.footpegXMm),
          footpegYMm: Number(form.footpegYMm),
          handlebarGripXMm: Number(form.handlebarGripXMm),
          handlebarGripYMm: Number(form.handlebarGripYMm),
          wetWeightKg: Number(form.wetWeightKg),
        },
      };

      await apiRequest('/api/v1/admin/bikes', {
        method: 'POST',
        body: payload,
      });
      setModalOpen(false);
      setForm((prev) => ({ ...INITIAL_NEW_BIKE, brandId: prev.brandId }));
      setFeedback(t('adminBikes.createdToast', { name: payload.name }));
      await loadBikes();
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSoftDelete = async (bike) => {
    if (!isAdmin) return;
    if (!window.confirm(t('adminBikes.confirmDelete', { name: bike.name }))) {
      return;
    }
    setError('');
    setFeedback('');
    try {
      await apiRequest(`/api/v1/admin/bikes/${bike.id}`, {
        method: 'DELETE',
      });
      setFeedback(t('adminBikes.deletedToast', { name: bike.name }));
      await loadBikes();
    } catch (err) {
      setError(localizeApiError(err, locale));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{t('adminBikes.title')}</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {user?.role === USER_ROLES.SALES_STAFF
              ? t('adminBikes.subtitleSales')
              : t('adminBikes.subtitleAdmin')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadBikes}
            className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-canvas"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.reload')}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-sm bg-ink px-3.5 py-2 text-xs font-semibold text-surface hover:bg-signal"
            >
              <Plus className="h-4 w-4" />
              {t('adminBikes.addBikeBtn')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('adminBikes.searchPlaceholder')}
          className="rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
        >
          <option value="">{t('adminBikes.allStatuses')}</option>
          {Object.values(PRODUCT_STATUSES).map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSearch('');
            setStatusFilter('');
          }}
          className="rounded-sm border border-line-strong bg-canvas px-3 py-2 text-xs font-semibold text-ink hover:bg-surface"
        >
          {t('common.clearFilters')}
        </button>
      </div>

      {error && (
        <div className="rounded-sm border border-danger-border bg-danger-soft px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}
      {feedback && (
        <div className="rounded-sm border border-safe-border bg-safe-soft px-4 py-3 text-xs text-safe">
          {feedback}
        </div>
      )}

      {/* Bikes Table */}
      <div className="overflow-x-auto rounded-sm border border-line bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">{t('adminBikes.colSkuModel')}</th>
              <th className="px-4 py-3">{t('adminBikes.colSegment')}</th>
              <th className="px-4 py-3 text-right">{t('adminBikes.colPrice')}</th>
              <th className="px-4 py-3 text-right">{t('adminBikes.colSeat')}</th>
              <th className="px-4 py-3 text-right">{t('adminBikes.colInventory')}</th>
              <th className="px-4 py-3">{t('adminBikes.colStatus')}</th>
              <th className="px-4 py-3 text-right">{t('adminBikes.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bikes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  {loading ? t('common.loading') : t('adminBikes.empty')}
                </td>
              </tr>
            ) : (
              bikes.map((bike) => (
                <tr key={bike.id} className="hover:bg-canvas/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProductThumbnail
                        itemType="BIKE"
                        size="sm"
                        src={bike.coverImageUrl}
                        alt={bike.name}
                        sku={bike.sku}
                      />
                      <div>
                        <p className="font-semibold text-ink">{bike.name}</p>
                        <p className="font-mono text-[11px] text-ink-muted">
                          {bike.sku} · {bike.brand?.name} · {bike.modelYear}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {getCategoryLabel(bike.category, locale)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-telemetry">
                    {formatVnd(bike.priceVnd, locale)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink-secondary tabular-telemetry">
                    {bike.geometrySpec?.unladenSeatHeightMm ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-telemetry">
                    <span className="text-ink-secondary">{bike.stockQty}</span> /{' '}
                    <span className="text-warning">{bike.activeReservedQty ?? 0}</span> /{' '}
                    <span className="font-bold text-ink">{bike.availableQty ?? bike.stockQty}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-sm border border-line bg-canvas px-2 py-0.5 font-mono text-[10px] font-semibold text-ink">
                      {bike.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/admin/bikes/${bike.id}`}
                        className="inline-flex items-center gap-1 rounded-sm border border-line-strong bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-signal hover:text-signal"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        {t('adminBikes.detailCalibrateBtn')}
                      </Link>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleSoftDelete(bike)}
                          className="rounded-sm border border-danger-border bg-danger-soft p-1.5 text-danger hover:opacity-90"
                          title={t('common.delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Bike Modal */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sm border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <Dialog.Title className="text-lg font-bold text-ink">
                {t('adminBikes.modalTitle')}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="rounded-sm border border-line p-1.5 text-ink">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreateBike} className="mt-4 space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.brand')}
                  </span>
                  <select
                    required
                    value={form.brandId}
                    onChange={(e) => setForm((p) => ({ ...p, brandId: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.sku')}
                  </span>
                  <input
                    required
                    value={form.sku}
                    onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))}
                    placeholder="KTM-250EXCF-2026"
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.name')}
                  </span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="KTM 250 EXC-F 2026"
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.slug')}
                  </span>
                  <input
                    required
                    value={form.slug}
                    onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                    placeholder="ktm-250-exc-f-2026"
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.category')}
                  </span>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink"
                  >
                    {Object.values(BIKE_CATEGORIES).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.ridingFocus')}
                  </span>
                  <select
                    value={form.ridingFocus}
                    onChange={(e) => setForm((p) => ({ ...p, ridingFocus: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink"
                  >
                    {Object.values(RIDING_FOCUSES).map((rf) => (
                      <option key={rf} value={rf}>
                        {rf}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.priceVnd')}
                  </span>
                  <input
                    type="number"
                    required
                    value={form.priceVnd}
                    onChange={(e) => setForm((p) => ({ ...p, priceVnd: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.depositVnd')}
                  </span>
                  <input
                    type="number"
                    required
                    value={form.depositAmountVnd}
                    onChange={(e) => setForm((p) => ({ ...p, depositAmountVnd: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.stockQty')}
                  </span>
                  <input
                    type="number"
                    required
                    min={0}
                    value={form.stockQty}
                    onChange={(e) => setForm((p) => ({ ...p, stockQty: e.target.value }))}
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikes.fields.seatHeightMm')}
                  </span>
                  <input
                    type="number"
                    required
                    min={500}
                    max={1100}
                    value={form.unladenSeatHeightMm}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        unladenSeatHeightMm: e.target.value,
                        seatPocketYMm: e.target.value,
                      }))
                    }
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-sm border border-line-strong px-4 py-2 font-semibold text-ink"
                  >
                    {t('common.cancel')}
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-sm bg-ink px-4 py-2 font-semibold text-surface hover:bg-signal disabled:opacity-50"
                >
                  {submitting ? t('adminBikes.creatingBtn') : t('adminBikes.createBtn')}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
