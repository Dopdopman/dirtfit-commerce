'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, Check, RefreshCw, Save } from 'lucide-react';
import {
  BIKE_CATEGORIES,
  BikeGeometrySpecSchema,
  PRODUCT_STATUSES,
  RIDING_FOCUSES,
  SEAT_FOAM_FIRMNESS,
} from '@dirtfit/shared';
import BikePhotoManager from '@/components/admin/BikePhotoManager';
import BlueprintCalibrationTool from '@/components/admin/BlueprintCalibrationTool';
import { canAccessAdminOnlyFeature } from '@/lib/admin-helpers';
import { apiRequest } from '@/lib/api-client';
import { formatVnd } from '@/lib/formatters';
import { localizeApiError } from '@/lib/i18n/translate';
import { useAuth } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Admin Bike Detail Workspace (`/admin/bikes/[id]`) with 4 Radix Tabs:
 * 1. General & Stock, 2. Geometry Spec, 3. Media & Blueprint Calibration, 4. Accessory Compatibility Matrix.
 * @returns {import('react').JSX.Element}
 */
export default function AdminBikeDetailPage() {
  const params = useParams();
  const bikeId = typeof params?.id === 'string' ? params.id : '';
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const isAdmin = canAccessAdminOnlyFeature(user?.role);

  const [bike, setBike] = useState(null);
  const [allAccessories, setAllAccessories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [generalForm, setGeneralForm] = useState({
    name: '',
    modelYear: 2026,
    category: 'ENDURO',
    ridingFocus: 'OFF_ROAD',
    engineCc: 350,
    streetLegal: true,
    priceVnd: 0,
    depositAmountVnd: 0,
    stockQty: 0,
    status: 'ACTIVE',
    shortSummary: '',
    descriptionMd: '',
  });

  const [geoForm, setGeoForm] = useState(null);
  const [compatDrafts, setCompatDrafts] = useState({});

  const hydrateForms = (bikeData) => {
    setGeneralForm({
      name: bikeData.name || '',
      modelYear: bikeData.modelYear || 2026,
      category: bikeData.category || 'ENDURO',
      ridingFocus: bikeData.ridingFocus || 'OFF_ROAD',
      engineCc: bikeData.engineCc || 250,
      streetLegal: Boolean(bikeData.streetLegal),
      priceVnd: bikeData.priceVnd ?? 0,
      depositAmountVnd: bikeData.depositAmountVnd ?? 0,
      stockQty: bikeData.stockQty ?? 0,
      status: bikeData.status || 'ACTIVE',
      shortSummary: bikeData.shortSummary || '',
      descriptionMd: bikeData.descriptionMd || '',
    });

    if (bikeData.geometrySpec) {
      setGeoForm({ ...bikeData.geometrySpec });
    }

    const nextCompat = {};
    for (const row of bikeData.compatibilities ?? []) {
      nextCompat[row.accessoryId] = {
        enabled: true,
        exactSeatDropMm: row.exactSeatDropMm ?? '',
        exactForkDropMm: row.exactForkDropMm ?? '',
        requiresWorkshopInstall: Boolean(row.requiresWorkshopInstall),
        installLaborVnd: row.installLaborVnd ?? 0,
        fitmentNotes: row.fitmentNotes || '',
      };
    }
    setCompatDrafts(nextCompat);
  };

  const loadData = useCallback(async () => {
    if (!bikeId) return;
    setLoading(true);
    setError('');
    try {
      const [bikeRes, accRes] = await Promise.all([
        apiRequest(`/api/v1/admin/bikes/${bikeId}`),
        apiRequest('/api/v1/admin/accessories?limit=50'),
      ]);
      const loadedBike = bikeRes?.bike ?? null;
      setBike(loadedBike);
      setAllAccessories(Array.isArray(accRes) ? accRes : []);
      if (loadedBike) {
        hydrateForms(loadedBike);
      }
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [bikeId, locale]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    if (!bike) return;
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const body = isAdmin
        ? {
            name: generalForm.name.trim(),
            modelYear: Number(generalForm.modelYear),
            category: generalForm.category,
            ridingFocus: generalForm.ridingFocus,
            engineCc: Number(generalForm.engineCc),
            streetLegal: Boolean(generalForm.streetLegal),
            priceVnd: Number(generalForm.priceVnd),
            depositAmountVnd: Number(generalForm.depositAmountVnd),
            stockQty: Number(generalForm.stockQty),
            status: generalForm.status,
            shortSummary: generalForm.shortSummary.trim() || null,
            descriptionMd: generalForm.descriptionMd.trim() || null,
            version: bike.version,
          }
        : {
            stockQty: Number(generalForm.stockQty),
            status: generalForm.status,
            version: bike.version,
          };

      await apiRequest(`/api/v1/admin/bikes/${bike.id}`, {
        method: 'PATCH',
        body,
      });
      setFeedback(t('adminBikeDetail.generalSaved'));
      await loadData();
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGeometry = async (e) => {
    e.preventDefault();
    if (!isAdmin || !bike || !geoForm) return;
    setSaving(true);
    setError('');
    setFeedback('');

    const parsed = BikeGeometrySpecSchema.safeParse({
      unladenSeatHeightMm: Number(geoForm.unladenSeatHeightMm),
      seatWidthMm: Number(geoForm.seatWidthMm),
      wheelbaseMm: Number(geoForm.wheelbaseMm),
      groundClearanceMm: Number(geoForm.groundClearanceMm),
      frontWheelDiameterIn: Number(geoForm.frontWheelDiameterIn),
      rearWheelDiameterIn: Number(geoForm.rearWheelDiameterIn),
      frontTireOuterRadiusMm: Number(geoForm.frontTireOuterRadiusMm),
      rearTireOuterRadiusMm: Number(geoForm.rearTireOuterRadiusMm),
      frontTravelMm: Number(geoForm.frontTravelMm),
      rearTravelMm: Number(geoForm.rearTravelMm),
      staticSagRearMm: Number(geoForm.staticSagRearMm),
      staticSagFrontMm: Number(geoForm.staticSagFrontMm),
      targetRiderSagRatio: Number(geoForm.targetRiderSagRatio ?? 0.33),
      referenceRiderWeightKg: Number(geoForm.referenceRiderWeightKg ?? 83),
      linkageProgressionAlpha: Number(geoForm.linkageProgressionAlpha ?? 0.85),
      seatFoamFirmness: geoForm.seatFoamFirmness || 'MEDIUM',
      seatPocketXMm: Number(geoForm.seatPocketXMm),
      seatPocketYMm: Number(geoForm.seatPocketYMm),
      footpegXMm: Number(geoForm.footpegXMm),
      footpegYMm: Number(geoForm.footpegYMm),
      handlebarGripXMm: Number(geoForm.handlebarGripXMm),
      handlebarGripYMm: Number(geoForm.handlebarGripYMm),
      rakeDeg: geoForm.rakeDeg !== null && geoForm.rakeDeg !== '' ? Number(geoForm.rakeDeg) : null,
      trailMm: geoForm.trailMm !== null && geoForm.trailMm !== '' ? Number(geoForm.trailMm) : null,
      wetWeightKg: Number(geoForm.wetWeightKg),
      fuelCapacityL:
        geoForm.fuelCapacityL !== null && geoForm.fuelCapacityL !== ''
          ? Number(geoForm.fuelCapacityL)
          : null,
    });

    if (!parsed.success) {
      setSaving(false);
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }

    try {
      await apiRequest(`/api/v1/admin/bikes/${bike.id}`, {
        method: 'PATCH',
        body: {
          version: bike.version,
          geometrySpec: parsed.data,
        },
      });
      setFeedback(t('adminBikeDetail.geometrySaved'));
      await loadData();
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setSaving(false);
    }
  };

  const toggleCompatibility = (accessoryId) => {
    setCompatDrafts((prev) => {
      const existing = prev[accessoryId];
      if (existing?.enabled) {
        return {
          ...prev,
          [accessoryId]: { ...existing, enabled: false },
        };
      }
      return {
        ...prev,
        [accessoryId]: {
          enabled: true,
          exactSeatDropMm: existing?.exactSeatDropMm ?? '',
          exactForkDropMm: existing?.exactForkDropMm ?? '',
          requiresWorkshopInstall: existing?.requiresWorkshopInstall ?? false,
          installLaborVnd: existing?.installLaborVnd ?? 0,
          fitmentNotes: existing?.fitmentNotes ?? '',
        },
      };
    });
  };

  const handleSaveCompatibilities = async () => {
    if (!isAdmin || !bike) return;
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const compatibilities = Object.entries(compatDrafts)
        .filter(([, entry]) => entry.enabled)
        .map(([accessoryId, entry]) => ({
          accessoryId,
          exactSeatDropMm:
            entry.exactSeatDropMm === '' || entry.exactSeatDropMm === null
              ? null
              : Number(entry.exactSeatDropMm),
          exactForkDropMm:
            entry.exactForkDropMm === '' || entry.exactForkDropMm === null
              ? null
              : Number(entry.exactForkDropMm),
          requiresWorkshopInstall: Boolean(entry.requiresWorkshopInstall),
          installLaborVnd: Number(entry.installLaborVnd || 0),
          fitmentNotes: entry.fitmentNotes?.trim() || null,
        }));

      await apiRequest(`/api/v1/admin/bikes/${bike.id}/compatibilities`, {
        method: 'PUT',
        body: { compatibilities },
      });
      setFeedback(t('adminBikeDetail.compatSaved', { count: compatibilities.length }));
      await loadData();
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !bike) {
    return (
      <div className="rounded-sm border border-line bg-surface p-8 text-center text-sm text-ink-secondary">
        {t('common.loading')}
      </div>
    );
  }

  if (!bike) {
    return (
      <div className="space-y-4">
        <div className="rounded-sm border border-danger-border bg-danger-soft p-4 text-sm text-danger">
          {error || t('adminBikeDetail.notFound')}
        </div>
        <Link href="/admin/bikes" className="text-xs font-semibold text-signal hover:underline">
          &larr; {t('adminBikeDetail.backList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/bikes"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-secondary hover:text-signal"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('adminBikeDetail.backList')}
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{bike.name}</h1>
          <p className="font-mono text-xs text-ink-muted">
            {t('adminBikeDetail.metaLine', {
              sku: bike.sku,
              version: bike.version,
              avail: bike.availableQty,
              stock: bike.stockQty,
              price: formatVnd(bike.priceVnd, locale),
            })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/bikes/${bike.slug}`}
            target="_blank"
            className="rounded-sm border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-line-strong"
          >
            {t('adminBikeDetail.viewStorefront')}
          </Link>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-canvas"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>
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

      <Tabs.Root defaultValue="calibration" className="space-y-4">
        <Tabs.List className="flex flex-wrap gap-1 rounded-sm border-b border-line bg-surface p-1.5">
          <Tabs.Trigger
            value="general"
            className="rounded-sm px-3 py-2 text-xs font-semibold text-ink-secondary data-[state=active]:bg-ink data-[state=active]:text-surface"
          >
            {t('adminBikeDetail.tabs.general')}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="geometry"
            className="rounded-sm px-3 py-2 text-xs font-semibold text-ink-secondary data-[state=active]:bg-ink data-[state=active]:text-surface"
          >
            {t('adminBikeDetail.tabs.geometry')}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="calibration"
            className="rounded-sm px-3 py-2 text-xs font-semibold text-ink-secondary data-[state=active]:bg-signal data-[state=active]:text-surface"
          >
            {t('adminBikeDetail.tabs.calibration')}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="compatibility"
            className="rounded-sm px-3 py-2 text-xs font-semibold text-ink-secondary data-[state=active]:bg-ink data-[state=active]:text-surface"
          >
            {t('adminBikeDetail.tabs.compatibility', {
              count: bike.compatibilities?.length ?? 0,
            })}
          </Tabs.Trigger>
        </Tabs.List>

        {/* Tab 1: General Info & Stock */}
        <Tabs.Content value="general">
          <form
            onSubmit={handleSaveGeneral}
            className="space-y-4 rounded-sm border border-line bg-surface p-5 text-xs"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1">
                <span className="font-semibold text-ink-secondary">
                  {t('adminBikeDetail.fields.name')}
                </span>
                <input
                  disabled={!isAdmin}
                  value={generalForm.name}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-60"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-ink-secondary">
                  {t('adminBikeDetail.fields.category')}
                </span>
                <select
                  disabled={!isAdmin}
                  value={generalForm.category}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, category: e.target.value }))}
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-60"
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
                  {t('adminBikeDetail.fields.ridingFocus')}
                </span>
                <select
                  disabled={!isAdmin}
                  value={generalForm.ridingFocus}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, ridingFocus: e.target.value }))}
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-60"
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
                  {t('adminBikeDetail.fields.priceVnd')}
                </span>
                <input
                  type="number"
                  disabled={!isAdmin}
                  value={generalForm.priceVnd}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, priceVnd: e.target.value }))}
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink disabled:opacity-60"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-ink-secondary">
                  {t('adminBikeDetail.fields.depositVnd')}
                </span>
                <input
                  type="number"
                  disabled={!isAdmin}
                  value={generalForm.depositAmountVnd}
                  onChange={(e) =>
                    setGeneralForm((p) => ({ ...p, depositAmountVnd: e.target.value }))
                  }
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink disabled:opacity-60"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-ink-secondary">
                  {t('adminBikeDetail.fields.stockQty')}
                </span>
                <input
                  type="number"
                  min={0}
                  value={generalForm.stockQty}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, stockQty: e.target.value }))}
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-ink-secondary">
                  {t('adminBikeDetail.fields.status')}
                </span>
                <select
                  value={generalForm.status}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, status: e.target.value }))}
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink"
                >
                  {Object.values(PRODUCT_STATUSES).map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="font-semibold text-ink-secondary">
                {t('adminBikeDetail.fields.shortSummary')}
              </span>
              <textarea
                rows={2}
                disabled={!isAdmin}
                value={generalForm.shortSummary}
                onChange={(e) => setGeneralForm((p) => ({ ...p, shortSummary: e.target.value }))}
                className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-60"
              />
            </label>

            <div className="flex justify-end border-t border-line pt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-sm bg-ink px-4 py-2 font-semibold text-surface hover:bg-signal disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Tabs.Content>

        {/* Tab 2: Geometry Spec */}
        <Tabs.Content value="geometry">
          {geoForm && (
            <form
              onSubmit={handleSaveGeometry}
              className="space-y-4 rounded-sm border border-line bg-surface p-5 text-xs"
            >
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {[
                  ['unladenSeatHeightMm', 'Unladen Seat Height (mm)'],
                  ['seatWidthMm', 'Seat Width (mm)'],
                  ['wheelbaseMm', 'Wheelbase (mm)'],
                  ['groundClearanceMm', 'Ground Clearance (mm)'],
                  ['frontWheelDiameterIn', 'Front Wheel (in)'],
                  ['rearWheelDiameterIn', 'Rear Wheel (in)'],
                  ['frontTireOuterRadiusMm', 'Front Tire Radius (mm)'],
                  ['rearTireOuterRadiusMm', 'Rear Tire Radius (mm)'],
                  ['frontTravelMm', 'Front Travel (mm)'],
                  ['rearTravelMm', 'Rear Travel (mm)'],
                  ['staticSagRearMm', 'Static Sag Rear (mm)'],
                  ['staticSagFrontMm', 'Static Sag Front (mm)'],
                  ['targetRiderSagRatio', 'Target Rider Sag Ratio'],
                  ['referenceRiderWeightKg', 'Ref Rider Weight (kg)'],
                  ['linkageProgressionAlpha', 'Linkage Alpha'],
                  ['wetWeightKg', 'Wet Weight (kg)'],
                  ['seatPocketXMm', 'Seat Pocket X (mm)'],
                  ['seatPocketYMm', 'Seat Pocket Y (mm)'],
                  ['footpegXMm', 'Footpeg X (mm)'],
                  ['footpegYMm', 'Footpeg Y (mm)'],
                  ['handlebarGripXMm', 'Handlebar Grip X (mm)'],
                  ['handlebarGripYMm', 'Handlebar Grip Y (mm)'],
                ].map(([field, label]) => (
                  <label key={field} className="space-y-1">
                    <span className="font-semibold text-ink-secondary">{label}</span>
                    <input
                      type="number"
                      step="any"
                      disabled={!isAdmin}
                      value={geoForm[field] ?? ''}
                      onChange={(e) => setGeoForm((prev) => ({ ...prev, [field]: e.target.value }))}
                      className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink disabled:opacity-60"
                    />
                  </label>
                ))}

                <label className="space-y-1">
                  <span className="font-semibold text-ink-secondary">
                    {t('adminBikeDetail.fields.seatFoam')}
                  </span>
                  <select
                    disabled={!isAdmin}
                    value={geoForm.seatFoamFirmness || 'MEDIUM'}
                    onChange={(e) =>
                      setGeoForm((prev) => ({ ...prev, seatFoamFirmness: e.target.value }))
                    }
                    className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-60"
                  >
                    {Object.values(SEAT_FOAM_FIRMNESS).map((firmness) => (
                      <option key={firmness} value={firmness}>
                        {firmness}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {isAdmin && (
                <div className="flex justify-end border-t border-line pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-sm bg-ink px-4 py-2 font-semibold text-surface hover:bg-signal disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? t('common.saving') : t('adminBikeDetail.saveGeometryBtn')}
                  </button>
                </div>
              )}
            </form>
          )}
        </Tabs.Content>

        {/* Tab 3: Real Product Photos + 2D Blueprint Calibration Tool */}
        <Tabs.Content value="calibration" className="space-y-6">
          <BikePhotoManager bike={bike} isAdmin={isAdmin} onBikeUpdated={loadData} />
          <BlueprintCalibrationTool bike={bike} isAdmin={isAdmin} onBikeUpdated={loadData} />
        </Tabs.Content>

        {/* Tab 4: Compatibility Matrix */}
        <Tabs.Content value="compatibility">
          <div className="space-y-4 rounded-sm border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink">
                  {t('adminBikeDetail.compatTitle')}
                </h3>
                <p className="text-xs text-ink-secondary">
                  {t('adminBikeDetail.compatSubtitle', { name: bike.name })}
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveCompatibilities}
                  className="inline-flex items-center gap-2 rounded-sm bg-ink px-4 py-2 text-xs font-semibold text-surface hover:bg-signal disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {saving ? t('common.saving') : t('adminBikeDetail.saveCompatBtn')}
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-3 py-2.5">{t('adminBikeDetail.compatCols.select')}</th>
                    <th className="px-3 py-2.5">{t('adminBikeDetail.compatCols.accessory')}</th>
                    <th className="px-3 py-2.5">{t('adminBikeDetail.compatCols.type')}</th>
                    <th className="px-3 py-2.5">{t('adminBikeDetail.compatCols.seatDrop')}</th>
                    <th className="px-3 py-2.5">{t('adminBikeDetail.compatCols.forkDrop')}</th>
                    <th className="px-3 py-2.5">{t('adminBikeDetail.compatCols.labor')}</th>
                    <th className="px-3 py-2.5">{t('adminBikeDetail.compatCols.notes')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {allAccessories.map((acc) => {
                    const draft = compatDrafts[acc.id] || {
                      enabled: false,
                      exactSeatDropMm: '',
                      exactForkDropMm: '',
                      requiresWorkshopInstall: false,
                      installLaborVnd: 0,
                      fitmentNotes: '',
                    };
                    return (
                      <tr key={acc.id} className={draft.enabled ? 'bg-signal-soft/30' : ''}>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            disabled={!isAdmin}
                            checked={Boolean(draft.enabled)}
                            onChange={() => toggleCompatibility(acc.id)}
                            className="h-4 w-4 accent-signal"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-ink">{acc.name}</p>
                          <p className="font-mono text-[10px] text-ink-muted">{acc.sku}</p>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-ink-secondary">
                          {acc.category}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            disabled={!isAdmin || !draft.enabled}
                            value={draft.exactSeatDropMm}
                            onChange={(e) =>
                              setCompatDrafts((prev) => ({
                                ...prev,
                                [acc.id]: { ...draft, exactSeatDropMm: e.target.value },
                              }))
                            }
                            placeholder={t('adminBikeDetail.defaultPlaceholder')}
                            className="w-24 rounded-sm border border-line bg-canvas px-2 py-1 font-mono text-xs disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            disabled={!isAdmin || !draft.enabled}
                            value={draft.exactForkDropMm}
                            onChange={(e) =>
                              setCompatDrafts((prev) => ({
                                ...prev,
                                [acc.id]: { ...draft, exactForkDropMm: e.target.value },
                              }))
                            }
                            placeholder="0"
                            className="w-20 rounded-sm border border-line bg-canvas px-2 py-1 font-mono text-xs disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            disabled={!isAdmin || !draft.enabled}
                            value={draft.installLaborVnd}
                            onChange={(e) =>
                              setCompatDrafts((prev) => ({
                                ...prev,
                                [acc.id]: { ...draft, installLaborVnd: e.target.value },
                              }))
                            }
                            className="w-28 rounded-sm border border-line bg-canvas px-2 py-1 font-mono text-xs disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            disabled={!isAdmin || !draft.enabled}
                            value={draft.fitmentNotes}
                            onChange={(e) =>
                              setCompatDrafts((prev) => ({
                                ...prev,
                                [acc.id]: { ...draft, fitmentNotes: e.target.value },
                              }))
                            }
                            placeholder={t('adminBikeDetail.notesPlaceholder')}
                            className="w-full min-w-[160px] rounded-sm border border-line bg-canvas px-2 py-1 text-xs disabled:opacity-40"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
