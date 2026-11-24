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
import BlueprintCalibrationTool from '@/components/admin/BlueprintCalibrationTool';
import { canAccessAdminOnlyFeature } from '@/lib/admin-helpers';
import { ApiError, apiRequest } from '@/lib/api-client';
import { formatVnd } from '@/lib/formatters';
import { useAuth } from '@/providers/AppProviders';

/**
 * Admin Bike Detail Workspace (`/admin/bikes/[id]`) with 4 Radix Tabs:
 * 1. General & Stock, 2. Geometry Spec, 3. Media & Blueprint Calibration, 4. Accessory Compatibility Matrix.
 * @returns {import('react').JSX.Element}
 */
export default function AdminBikeDetailPage() {
  const params = useParams();
  const bikeId = typeof params?.id === 'string' ? params.id : '';
  const { user } = useAuth();
  const isAdmin = canAccessAdminOnlyFeature(user?.role);

  const [bike, setBike] = useState(null);
  const [allAccessories, setAllAccessories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Tab 1 state
  const [generalForm, setGeneralForm] = useState({
    name: '',
    modelYear: 2026,
    category: 'ENDURO',
    ridingFocus: 'OFF_ROAD_ENDURO',
    engineCc: 350,
    streetLegal: true,
    priceVnd: 0,
    depositAmountVnd: 0,
    stockQty: 0,
    status: 'ACTIVE',
    shortSummary: '',
    descriptionMd: '',
  });

  // Tab 2 state
  const [geoForm, setGeoForm] = useState(null);

  // Tab 4 compatibility map keyed by accessoryId
  const [compatDrafts, setCompatDrafts] = useState({});

  const hydrateForms = (bikeData) => {
    setGeneralForm({
      name: bikeData.name || '',
      modelYear: bikeData.modelYear || 2026,
      category: bikeData.category || 'ENDURO',
      ridingFocus: bikeData.ridingFocus || 'OFF_ROAD_ENDURO',
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
        apiRequest('/api/v1/admin/accessories?limit=100'),
      ]);
      const loadedBike = bikeRes.data?.bike;
      setBike(loadedBike);
      setAllAccessories(accRes.data ?? []);
      if (loadedBike) {
        hydrateForms(loadedBike);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || err.message : 'Không thể tải thông tin xe.');
    } finally {
      setLoading(false);
    }
  }, [bikeId]);

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
      setFeedback('Đã lưu thông tin chung & tồn kho (version incremented).');
      await loadData();
    } catch (err) {
      setError(
        err instanceof ApiError ? `[${err.code}] ${err.detail || err.message}` : 'Lưu thất bại.'
      );
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
      setError(
        `Sai định dạng thông số hình học: ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`
      );
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
      setFeedback('Đã lưu BikeGeometrySpec & làm mới cache Simulator!');
      await loadData();
    } catch (err) {
      setError(
        err instanceof ApiError ? `[${err.code}] ${err.detail || err.message}` : 'Lưu thất bại.'
      );
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
      setFeedback(`Đã lưu ma trận ${compatibilities.length} phụ kiện tương thích.`);
      await loadData();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `[${err.code}] ${err.detail || err.message}`
          : 'Không thể lưu ma trận tương thích.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !bike) {
    return (
      <div className="rounded-sm border border-line bg-surface p-8 text-center text-sm text-ink-secondary">
        Đang tải thông số chi tiết xe &amp; Blueprint...
      </div>
    );
  }

  if (!bike) {
    return (
      <div className="space-y-4">
        <div className="rounded-sm border border-danger-border bg-danger-soft p-4 text-sm text-danger">
          {error || 'Không tìm thấy mẫu xe yêu cầu.'}
        </div>
        <Link href="/admin/bikes" className="text-xs font-semibold text-signal hover:underline">
          ← Quay lại danh sách xe
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
            Danh sách Xe
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{bike.name}</h1>
          <p className="font-mono text-xs text-ink-muted">
            SKU: {bike.sku} · Version: v{bike.version} · Kho khả dụng: {bike.availableQty}/
            {bike.stockQty} · Giá: {formatVnd(bike.priceVnd)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/bikes/${bike.slug}`}
            target="_blank"
            className="rounded-sm border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-line-strong"
          >
            Xem trên Storefront
          </Link>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-canvas"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
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
        <Tabs.List className="flex flex-wrap gap-1 border-b border-line bg-surface p-1.5 rounded-sm">
          <Tabs.Trigger
            value="general"
            className="rounded-sm px-3 py-2 text-xs font-semibold text-ink-secondary data-[state=active]:bg-ink data-[state=active]:text-surface"
          >
            1. Thông tin &amp; Tồn kho
          </Tabs.Trigger>
          <Tabs.Trigger
            value="geometry"
            className="rounded-sm px-3 py-2 text-xs font-semibold text-ink-secondary data-[state=active]:bg-ink data-[state=active]:text-surface"
          >
            2. Thông số Hình học (mm)
          </Tabs.Trigger>
          <Tabs.Trigger
            value="calibration"
            className="rounded-sm px-3 py-2 text-xs font-semibold text-ink-secondary data-[state=active]:bg-signal data-[state=active]:text-surface"
          >
            3. Media &amp; Blueprint Calibration
          </Tabs.Trigger>
          <Tabs.Trigger
            value="compatibility"
            className="rounded-sm px-3 py-2 text-xs font-semibold text-ink-secondary data-[state=active]:bg-ink data-[state=active]:text-surface"
          >
            4. Ma trận Phụ kiện ({bike.compatibilities?.length ?? 0})
          </Tabs.Trigger>
        </Tabs.List>

        {/* Tab 1: General Info & Stock */}
        <Tabs.Content value="general">
          <form
            onSubmit={handleSaveGeneral}
            className="rounded-sm border border-line bg-surface p-5 space-y-4 text-xs"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1">
                <span className="font-semibold text-ink-secondary">Tên mẫu xe</span>
                <input
                  disabled={!isAdmin}
                  value={generalForm.name}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-60"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-ink-secondary">Phân khúc</span>
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
                <span className="font-semibold text-ink-secondary">Riding Focus</span>
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
                <span className="font-semibold text-ink-secondary">Giá bán (VND)</span>
                <input
                  type="number"
                  disabled={!isAdmin}
                  value={generalForm.priceVnd}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, priceVnd: e.target.value }))}
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink disabled:opacity-60"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-ink-secondary">Tiền cọc (VND)</span>
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
                <span className="font-semibold text-ink-secondary">Tồn kho vật lý (stockQty)</span>
                <input
                  type="number"
                  min={0}
                  value={generalForm.stockQty}
                  onChange={(e) => setGeneralForm((p) => ({ ...p, stockQty: e.target.value }))}
                  className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-ink"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-ink-secondary">Trạng thái kinh doanh</span>
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
              <span className="font-semibold text-ink-secondary">Mô tả ngắn</span>
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
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </Tabs.Content>

        {/* Tab 2: Geometry Spec */}
        <Tabs.Content value="geometry">
          {geoForm && (
            <form
              onSubmit={handleSaveGeometry}
              className="rounded-sm border border-line bg-surface p-5 space-y-4 text-xs"
            >
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {[
                  ['unladenSeatHeightMm', 'Chiều cao yên không tải (mm)'],
                  ['seatWidthMm', 'Bề rộng yên (mm)'],
                  ['wheelbaseMm', 'Chiều dài cơ sở Wheelbase (mm)'],
                  ['groundClearanceMm', 'Khoảng sáng gầm (mm)'],
                  ['frontWheelDiameterIn', 'Vành trước (inch)'],
                  ['rearWheelDiameterIn', 'Vành sau (inch)'],
                  ['frontTireOuterRadiusMm', 'Bán kính lốp trước (mm)'],
                  ['rearTireOuterRadiusMm', 'Bán kính lốp sau (mm)'],
                  ['frontTravelMm', 'Hành trình phuộc trước (mm)'],
                  ['rearTravelMm', 'Hành trình phuộc sau (mm)'],
                  ['staticSagRearMm', 'Static Sag Sau (mm)'],
                  ['staticSagFrontMm', 'Static Sag Trước (mm)'],
                  ['targetRiderSagRatio', 'Target Rider Sag Ratio'],
                  ['referenceRiderWeightKg', 'Ref Rider Weight (kg)'],
                  ['linkageProgressionAlpha', 'Linkage Alpha'],
                  ['wetWeightKg', 'Trọng lượng ướt (kg)'],
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
                  <span className="font-semibold text-ink-secondary">Độ cứng mút yên</span>
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
                    {saving ? 'Đang lưu...' : 'Lưu Geometry Spec'}
                  </button>
                </div>
              )}
            </form>
          )}
        </Tabs.Content>

        {/* Tab 3: Blueprint Calibration Tool */}
        <Tabs.Content value="calibration">
          <BlueprintCalibrationTool bike={bike} isAdmin={isAdmin} onBikeUpdated={loadData} />
        </Tabs.Content>

        {/* Tab 4: Compatibility Matrix */}
        <Tabs.Content value="compatibility">
          <div className="rounded-sm border border-line bg-surface p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink">
                  Ma trận Phụ kiện tương thích (BikeAccessoryCompatibility)
                </h3>
                <p className="text-xs text-ink-secondary">
                  Chọn các phụ tùng lắp vừa cho {bike.name} và hiệu chỉnh mức hạ yên thực tế (mm).
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
                  {saving ? 'Đang lưu...' : 'Lưu Ma trận Tương thích (PUT)'}
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-3 py-2.5">Chọn</th>
                    <th className="px-3 py-2.5">Phụ kiện</th>
                    <th className="px-3 py-2.5">Loại</th>
                    <th className="px-3 py-2.5">Hạ yên exact (mm)</th>
                    <th className="px-3 py-2.5">Hạ phuộc (mm)</th>
                    <th className="px-3 py-2.5">Công lắp (VND)</th>
                    <th className="px-3 py-2.5">Ghi chú lắp đặt</th>
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
                            placeholder="Mặc định"
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
                            placeholder="Ghi chú kỹ thuật..."
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
