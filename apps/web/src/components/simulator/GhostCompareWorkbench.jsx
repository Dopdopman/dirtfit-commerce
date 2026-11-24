'use client';

import { useMemo, useState } from 'react';
import ParametricBikeSvg from '@/components/simulator/ParametricBikeSvg';
import RiderFigureSvg from '@/components/simulator/RiderFigureSvg';
import TechnicalSlider from '@/components/ui/TechnicalSlider';
import { formatMm, formatSignedDelta, formatVnd, getFitStatusMeta } from '@/lib/formatters';
import { buildGhostCompareScene } from '@/lib/simulator-helpers';
import { useRiderProfile } from '@/providers/AppProviders';

/**
 * Side-by-side Ghost Overlay comparison workbench scaling two motorcycles accurately in mm.
 * @param {object} props
 * @param {Array<object>} props.bikes
 * @param {string} [props.initialSlugA]
 * @param {string} [props.initialSlugB]
 * @returns {import('react').JSX.Element}
 */
export default function GhostCompareWorkbench({ bikes, initialSlugA, initialSlugB }) {
  const { riderProfile, setRiderProfile } = useRiderProfile();

  const defaultA = bikes.find((b) => b.slug === initialSlugA)?.id ?? bikes[0]?.id ?? '';
  const defaultB =
    bikes.find((b) => b.slug === initialSlugB && b.id !== defaultA)?.id ??
    bikes.find((b) => b.id !== defaultA)?.id ??
    bikes[0]?.id ??
    '';

  const [bikeAId, setBikeAId] = useState(defaultA);
  const [bikeBId, setBikeBId] = useState(defaultB);
  const [alignmentMode, setAlignmentMode] = useState('REAR_AXLE_GROUND');
  const [ghostOpacity, setGhostOpacity] = useState(72);

  const bikeA = useMemo(() => bikes.find((b) => b.id === bikeAId) ?? bikes[0], [bikes, bikeAId]);
  const bikeB = useMemo(
    () => bikes.find((b) => b.id === bikeBId) ?? bikes[1] ?? bikes[0],
    [bikes, bikeBId]
  );

  const scene = useMemo(() => {
    if (!bikeA?.geometrySpec || !bikeB?.geometrySpec) {
      return null;
    }
    return buildGhostCompareScene(bikeA.geometrySpec, bikeB.geometrySpec, riderProfile, {
      alignmentMode,
    });
  }, [bikeA?.geometrySpec, bikeB?.geometrySpec, riderProfile, alignmentMode]);

  if (!scene) {
    return (
      <div className="border border-line bg-surface p-8 text-center text-sm text-ink-secondary">
        Cần ít nhất 2 mẫu xe hoạt động để thực hiện so sánh Ghost Overlay.
      </div>
    );
  }

  const { comparison, bikeASvg, bikeBSvg, viewport } = scene;
  const fitA = getFitStatusMeta(comparison.bikeA.evaluation.footContact.contactStatus);
  const fitB = getFitStatusMeta(comparison.bikeB.evaluation.footContact.contactStatus);

  return (
    <div className="space-y-6">
      {/* Selection & Alignment Controls */}
      <div className="grid gap-4 border border-line bg-surface p-4 sm:grid-cols-4 sm:p-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Xe A (Carbon Ink)
          </label>
          <select
            value={bikeA.id}
            onChange={(e) => setBikeAId(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm font-medium text-ink"
          >
            {bikes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.geometrySpec?.unladenSeatHeightMm}mm)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ghost">
            Xe B (Ghost Cyan)
          </label>
          <select
            value={bikeB.id}
            onChange={(e) => setBikeBId(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-ghost/40 bg-canvas px-3 py-2 text-sm font-medium text-ink"
          >
            {bikes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.geometrySpec?.unladenSeatHeightMm}mm)
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Điểm neo chồng hình
          </span>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setAlignmentMode('REAR_AXLE_GROUND')}
              className={`rounded-sm border px-2 py-2 text-xs font-medium ${
                alignmentMode === 'REAR_AXLE_GROUND'
                  ? 'border-line-strong bg-ink text-surface'
                  : 'border-line bg-canvas text-ink-secondary'
              }`}
            >
              Trục sau & Đất
            </button>
            <button
              type="button"
              onClick={() => setAlignmentMode('SEAT_POCKET')}
              className={`rounded-sm border px-2 py-2 text-xs font-medium ${
                alignmentMode === 'SEAT_POCKET'
                  ? 'border-line-strong bg-ink text-surface'
                  : 'border-line bg-canvas text-ink-secondary'
              }`}
            >
              Hõm yên (Seat)
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <TechnicalSlider
            label="Độ mờ Ghost Xe B"
            value={ghostOpacity}
            min={20}
            max={100}
            unit="%"
            onChange={setGhostOpacity}
          />
        </div>
      </div>

      {/* Ghost Overlay Canvas + Rider Sliders */}
      <div className="grid border border-line bg-surface lg:grid-cols-12">
        <div className="border-b border-line cad-grid-bg lg:col-span-8 lg:border-b-0 lg:border-r">
          <svg
            viewBox={`0 0 ${viewport.widthPx} ${viewport.heightPx}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Ghost Overlay so sánh ${bikeA.name} và ${bikeB.name}`}
          >
            <line
              x1="20"
              y1={viewport.originSvgY}
              x2={viewport.widthPx - 20}
              y2={viewport.originSvgY}
              stroke="#1C1E21"
              strokeWidth="2"
            />
            <ParametricBikeSvg svgWireframe={bikeASvg.wireframe} variant="primary" />
            <ParametricBikeSvg
              svgWireframe={bikeBSvg.wireframe}
              variant="ghost"
              opacity={ghostOpacity / 100}
            />
            <RiderFigureSvg joints={bikeASvg.joints} contactTone={fitA.tone} />
          </svg>
        </div>

        <div className="space-y-5 p-5 lg:col-span-4">
          <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
            Thể trạng người lái chung
          </div>
          <TechnicalSlider
            label="Chiều cao"
            value={riderProfile.heightCm}
            min={145}
            max={205}
            unit="cm"
            onChange={(heightCm) => setRiderProfile({ heightCm })}
          />
          <TechnicalSlider
            label="Cân nặng"
            value={riderProfile.weightKg}
            min={45}
            max={135}
            unit="kg"
            onChange={(weightKg) => setRiderProfile({ weightKg })}
          />

          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink">{bikeA.name}</span>
              <span className={`rounded-sm border px-2 py-0.5 font-semibold ${fitA.className}`}>
                {comparison.bikeA.evaluation.fitScore}/100 · {fitA.label}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ghost">{bikeB.name}</span>
              <span className={`rounded-sm border px-2 py-0.5 font-semibold ${fitB.className}`}>
                {comparison.bikeB.evaluation.fitScore}/100 · {fitB.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Geometric Delta Summary Table */}
      <div className="overflow-x-auto border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Thông số hình học & Vận hành</th>
              <th className="px-4 py-3 text-ink">{bikeA.name}</th>
              <th className="px-4 py-3 text-ghost">{bikeB.name}</th>
              <th className="px-4 py-3">Chênh lệch (B so với A)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-telemetry">
            <tr>
              <td className="px-4 py-3 font-sans text-ink-secondary">Yên tĩnh (Unladen)</td>
              <td className="px-4 py-3">{formatMm(bikeA.geometrySpec.unladenSeatHeightMm)}</td>
              <td className="px-4 py-3">{formatMm(bikeB.geometrySpec.unladenSeatHeightMm)}</td>
              <td className="px-4 py-3 font-semibold">
                {formatSignedDelta(comparison.deltas.unladenSeatHeightDeltaMm, 'mm')}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-sans text-ink-secondary">Yên thực tế khi ngồi (Sag)</td>
              <td className="px-4 py-3">
                {formatMm(comparison.bikeA.evaluation.sag.effectiveSeatHeightMm)}
              </td>
              <td className="px-4 py-3">
                {formatMm(comparison.bikeB.evaluation.sag.effectiveSeatHeightMm)}
              </td>
              <td className="px-4 py-3 font-semibold text-signal">
                {formatSignedDelta(comparison.deltas.effectiveSeatHeightDeltaMm, 'mm')}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-sans text-ink-secondary">Độ rộng yên (Seat Width)</td>
              <td className="px-4 py-3">
                {formatMm(comparison.bikeA.evaluation.footContact.effectiveSeatWidthMm)}
              </td>
              <td className="px-4 py-3">
                {formatMm(comparison.bikeB.evaluation.footContact.effectiveSeatWidthMm)}
              </td>
              <td className="px-4 py-3 font-semibold">
                {formatSignedDelta(comparison.deltas.seatWidthDeltaMm, 'mm')}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-sans text-ink-secondary">Trọng lượng ướt</td>
              <td className="px-4 py-3">{bikeA.geometrySpec.wetWeightKg} kg</td>
              <td className="px-4 py-3">{bikeB.geometrySpec.wetWeightKg} kg</td>
              <td className="px-4 py-3 font-semibold">
                {formatSignedDelta(comparison.deltas.wetWeightDeltaKg, 'kg')}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-sans text-ink-secondary">Góc gối ngồi chạy</td>
              <td className="px-4 py-3">
                {comparison.bikeA.evaluation.kinematics.seated.kneeAngleDeg}°
              </td>
              <td className="px-4 py-3">
                {comparison.bikeB.evaluation.kinematics.seated.kneeAngleDeg}°
              </td>
              <td className="px-4 py-3 font-semibold">
                {formatSignedDelta(comparison.deltas.seatedKneeAngleDeltaDeg, '°')}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-sans text-ink-secondary">Giá bán niêm yết</td>
              <td className="px-4 py-3">{formatVnd(bikeA.priceVnd)}</td>
              <td className="px-4 py-3">{formatVnd(bikeB.priceVnd)}</td>
              <td className="px-4 py-3 font-semibold">
                {formatSignedDelta(
                  Math.round((bikeB.priceVnd - bikeA.priceVnd) / 1_000_000),
                  'tr ₫'
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
