'use client';

import { useEffect, useMemo, useState } from 'react';
import { STANCE_MODES } from '@dirtfit/ergonomics-engine/constants';
import { Moon, RotateCcw, ShoppingCart, Sun } from 'lucide-react';
import ParametricBikeSvg from '@/components/simulator/ParametricBikeSvg';
import RiderFigureSvg from '@/components/simulator/RiderFigureSvg';
import TechnicalSlider from '@/components/ui/TechnicalSlider';
import {
  formatMm,
  formatSignedDelta,
  formatVnd,
  getFitStatusMeta,
  getSagStatusMeta,
} from '@/lib/formatters';
import { buildSimulatorScene } from '@/lib/simulator-helpers';
import { useCart, useRiderProfile } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Interactive 60fps 5-Layer 2D Parametric Rider Fit Simulator & Smart Upsell Workbench.
 * @param {object} props
 * @param {object} props.bike
 * @returns {import('react').JSX.Element|null}
 */
export default function RiderFitSimulator({ bike }) {
  const { riderProfile, setRiderProfile } = useRiderProfile();
  const { addComboBundle, addItem } = useCart();
  const { locale, dict, t } = useI18n();

  const [darkBlueprint, setDarkBlueprint] = useState(false);
  const [mods, setMods] = useState({
    loweringLinkMm: 0,
    forkDropMm: 0,
    lowSeatMm: 0,
    seatWidthReductionMm: 0,
    barRiserMm: 0,
  });
  const [bundleBusy, setBundleBusy] = useState(false);

  // Sync optional ?heightCm=...&weightKg=...&inseamCm=... links opened from AI Support Chat MiniFitCard
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const hRaw = Number(params.get('heightCm'));
    const wRaw = Number(params.get('weightKg'));
    const iRaw = Number(params.get('inseamCm'));

    const updates = {};
    if (Number.isFinite(hRaw) && hRaw >= 135 && hRaw <= 220) {
      updates.heightCm = Math.round(hRaw);
    }
    if (Number.isFinite(wRaw) && wRaw >= 35 && wRaw <= 160) {
      updates.weightKg = Math.round(wRaw);
    }
    if (Number.isFinite(iRaw) && iRaw >= 55 && iRaw <= 115) {
      updates.inseamCm = Math.round(iRaw);
    }

    if (Object.keys(updates).length > 0) {
      setRiderProfile((prev) => ({ ...prev, ...updates }));
    }
  }, [setRiderProfile]);

  const compatibleEngineInputs = useMemo(() => {
    return (bike.compatibilities ?? [])
      .filter((c) => c.accessory && (c.availableQty ?? 0) > 0)
      .map((c) => {
        const base = c.accessory.ergoImpactJson ?? {};
        return {
          id: c.accessory.id,
          name: c.accessory.name,
          category: c.accessory.category,
          priceVnd: c.accessory.priceVnd,
          installLaborVnd: c.installLaborVnd ?? 0,
          stockQty: c.availableQty ?? 0,
          ergoImpact: {
            ...base,
            ...(c.exactSeatDropMm !== null && c.accessory.category === 'LOW_SEAT'
              ? { lowSeatMm: c.exactSeatDropMm }
              : {}),
            ...(c.exactSeatDropMm !== null && c.accessory.category === 'LOWERING_LINK'
              ? { loweringLinkMm: c.exactSeatDropMm }
              : {}),
            ...(c.exactForkDropMm !== null ? { forkDropMm: c.exactForkDropMm } : {}),
          },
        };
      });
  }, [bike.compatibilities]);

  const scene = useMemo(() => {
    if (!bike?.geometrySpec) {
      return null;
    }
    return buildSimulatorScene(bike.geometrySpec, riderProfile, mods, compatibleEngineInputs);
  }, [bike?.geometrySpec, riderProfile, mods, compatibleEngineInputs]);

  if (!scene) {
    return null;
  }

  const { evaluation, svgWireframe, svgJoints, referenceLines, rulerTicks, viewport } = scene;
  const fitMeta = getFitStatusMeta(evaluation.footContact.contactStatus, locale);
  const sagMeta = getSagStatusMeta(evaluation.sag.sagStatus, locale);
  const topUpsell = evaluation.upsellSuggestions?.[0] ?? null;

  const isSeatedOrStanding =
    riderProfile.stanceMode === STANCE_MODES.SEATED_RIDING ||
    riderProfile.stanceMode === STANCE_MODES.STANDING_ATTACK;

  const toggleMod = (key, amount) => {
    setMods((prev) => ({
      ...prev,
      [key]: prev[key] > 0 ? 0 : amount,
      ...(key === 'loweringLinkMm' ? { forkDropMm: prev[key] > 0 ? 0 : 10 } : {}),
    }));
  };

  const resetAll = () => {
    setMods({
      loweringLinkMm: 0,
      forkDropMm: 0,
      lowSeatMm: 0,
      seatWidthReductionMm: 0,
      barRiserMm: 0,
    });
  };

  const handleAddUpsellCombo = async (accessoryIds) => {
    setBundleBusy(true);
    try {
      await addComboBundle({ bikeId: bike.id, accessoryIds, quantity: 1 });
    } finally {
      setBundleBusy(false);
    }
  };

  const handleReserveBikeOnly = async () => {
    setBundleBusy(true);
    try {
      await addItem({ itemType: 'BIKE', bikeId: bike.id, quantity: 1 });
    } finally {
      setBundleBusy(false);
    }
  };

  const seatDeltaMm = Math.round(
    evaluation.sag.effectiveSeatHeightMm - bike.geometrySpec.unladenSeatHeightMm
  );

  return (
    <section
      id="simulator"
      className="mt-8 border border-line bg-surface"
      aria-label={t('simulator.title')}
    >
      {/* Top Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-ink-muted">
            {t('simulator.title')}
          </span>
          <span
            className={`rounded-sm border px-2.5 py-0.5 text-xs font-semibold ${fitMeta.className}`}
          >
            {fitMeta.label} ({evaluation.footContact.footContactPercent}%)
          </span>
          <span
            className={`rounded-sm border px-2.5 py-0.5 text-xs font-semibold ${sagMeta.className}`}
          >
            {sagMeta.label} · {evaluation.sag.sagPercentOfTravel}%
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDarkBlueprint((d) => !d)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1 text-xs font-medium text-ink-secondary hover:border-line-strong hover:text-ink"
          >
            {darkBlueprint ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {darkBlueprint ? t('simulator.darkGridOn') : t('simulator.darkGridOff')}
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1 rounded-sm border border-line px-2.5 py-1 text-xs font-medium text-ink-secondary hover:border-line-strong hover:text-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('simulator.resetMods')}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12">
        {/* Left: 5-Layer 60fps SVG Blueprint Canvas */}
        <div className="border-b border-line lg:col-span-8 lg:border-b-0 lg:border-r">
          <div className={darkBlueprint ? 'cad-grid-dark' : 'cad-grid-bg'}>
            <svg
              viewBox={`0 0 ${viewport.widthPx} ${viewport.heightPx}`}
              className="h-auto w-full select-none"
              role="img"
              aria-label={`${bike.name} ${t('simulator.title')}`}
            >
              {/* Layer 1: Millimeter Y-Axis Ruler & Ground Line */}
              <line
                x1="56"
                y1="24"
                x2="56"
                y2={referenceLines.groundY}
                stroke={darkBlueprint ? '#4B5563' : '#9CA3AF'}
                strokeWidth="1"
              />
              {rulerTicks.map((tick) => (
                <g key={tick.mm}>
                  <line
                    x1="50"
                    y1={tick.yPx}
                    x2={viewport.widthPx - 20}
                    y2={tick.yPx}
                    stroke={darkBlueprint ? '#FFFFFF' : '#1C1E21'}
                    strokeOpacity="0.08"
                    strokeDasharray="3 4"
                  />
                  <text
                    x="44"
                    y={tick.yPx + 4}
                    textAnchor="end"
                    fontSize="10"
                    fontFamily="var(--font-mono), monospace"
                    fill={darkBlueprint ? '#9CA3AF' : '#52565E'}
                  >
                    {tick.mm}
                  </text>
                </g>
              ))}
              <line
                x1="20"
                y1={referenceLines.groundY}
                x2={viewport.widthPx - 20}
                y2={referenceLines.groundY}
                stroke={darkBlueprint ? '#E5E7EB' : '#1C1E21'}
                strokeWidth="2"
              />

              {/* Layer 2: Parametric Millimeter-Accurate Enduro/Dirtbike CAD */}
              <ParametricBikeSvg
                svgWireframe={svgWireframe}
                variant={darkBlueprint ? 'dark' : 'primary'}
              />

              {/* Layer 3: Unladen vs Effective Sag Seat Height Reference Lines */}
              <line
                x1="70"
                y1={referenceLines.unladenSeatY}
                x2={viewport.widthPx - 40}
                y2={referenceLines.unladenSeatY}
                stroke={darkBlueprint ? '#9CA3AF' : '#7C818B'}
                strokeDasharray="5 5"
                strokeWidth="1"
              />
              <text
                x={viewport.widthPx - 44}
                y={referenceLines.unladenSeatY - 6}
                textAnchor="end"
                fontSize="11"
                fontFamily="var(--font-mono), monospace"
                fill={darkBlueprint ? '#9CA3AF' : '#52565E'}
              >
                {t('simulator.legendUnladenSeat')}: {bike.geometrySpec.unladenSeatHeightMm}mm
              </text>

              <line
                x1="70"
                y1={referenceLines.effectiveSeatY}
                x2={viewport.widthPx - 40}
                y2={referenceLines.effectiveSeatY}
                stroke="#E84C1E"
                strokeWidth="1.5"
              />
              <text
                x={viewport.widthPx - 44}
                y={referenceLines.effectiveSeatY + 14}
                textAnchor="end"
                fontSize="11"
                fontWeight="700"
                fontFamily="var(--font-mono), monospace"
                fill="#E84C1E"
              >
                {t('simulator.legendLoadedSeat')}: {evaluation.sag.effectiveSeatHeightMm}mm (
                {formatSignedDelta(seatDeltaMm, 'mm')})
              </text>

              {/* Layer 4: Articulated Anatomical Rider */}
              <RiderFigureSvg
                joints={svgJoints}
                darkMode={darkBlueprint}
                contactTone={fitMeta.tone}
              />

              {/* Layer 5: Minimal Telemetry Callouts */}
              {isSeatedOrStanding && (
                <g>
                  <rect
                    x={svgJoints.knee.x + 12}
                    y={svgJoints.knee.y - 12}
                    width="74"
                    height="22"
                    rx="3"
                    fill={darkBlueprint ? '#111827' : '#FFFFFF'}
                    stroke="#E3E3DC"
                  />
                  <text
                    x={svgJoints.knee.x + 49}
                    y={svgJoints.knee.y + 3}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="var(--font-mono), monospace"
                    fill={darkBlueprint ? '#F9FAFB' : '#111214'}
                  >
                    {riderProfile.stanceMode === STANCE_MODES.STANDING_ATTACK
                      ? evaluation.kinematics.standing.kneeAngleDeg
                      : evaluation.kinematics.seated.kneeAngleDeg}
                    °
                  </text>
                </g>
              )}
            </svg>
          </div>

          {/* Monospace Live Telemetry Readout Row */}
          <div className="grid grid-cols-2 divide-x divide-y divide-line border-t border-line sm:grid-cols-4 sm:divide-y-0">
            <div className="p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-ink-muted">
                {t('simulator.fitScoreLabel')}
              </div>
              <div className="mt-1 text-xl font-bold text-ink tabular-telemetry">
                {evaluation.fitScore}
                <span className="text-xs font-normal text-ink-muted"> /100</span>
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-ink-muted">
                {t('simulator.effectiveSeatLabel')}
              </div>
              <div className="mt-1 text-xl font-bold text-signal tabular-telemetry">
                {formatMm(evaluation.sag.effectiveSeatHeightMm)}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-ink-muted">
                {t('simulator.riderSagLabel')}
              </div>
              <div className="mt-1 text-base font-bold text-ink tabular-telemetry">
                {evaluation.sag.riderSagRearMm} mm ({evaluation.sag.sagPercentOfTravel}%)
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-ink-muted">
                {t('simulator.kneeAngleLabel')}
              </div>
              <div className="mt-1 text-base font-bold text-ink tabular-telemetry">
                {evaluation.kinematics.seated.kneeAngleDeg}° /{' '}
                {evaluation.kinematics.seated.torsoLeanDeg}°
              </div>
            </div>
          </div>
        </div>

        {/* Right: Ergonomic Sliders & 1-Click Mod Switcher */}
        <div className="flex flex-col justify-between p-5 lg:col-span-4">
          <div className="space-y-5">
            <TechnicalSlider
              label={t('simulator.heightSlider')}
              value={riderProfile.heightCm}
              min={145}
              max={205}
              unit="cm"
              onChange={(heightCm) => setRiderProfile({ heightCm })}
            />
            <TechnicalSlider
              label={t('simulator.weightSlider')}
              value={riderProfile.weightKg}
              min={45}
              max={135}
              unit="kg"
              onChange={(weightKg) => setRiderProfile({ weightKg })}
            />
            <TechnicalSlider
              label={t('simulator.inseamSlider')}
              value={riderProfile.inseamCm ?? evaluation.anthropometry.inseamCm}
              min={62}
              max={105}
              unit="cm"
              onChange={(inseamCm) => setRiderProfile({ inseamCm })}
            />

            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-secondary">
                {t('simulator.bootsSelect')}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(dict.enums.footwear).map(([key, label]) => {
                  const active = riderProfile.footwear === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRiderProfile({ footwear: key })}
                      className={`rounded-sm border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                        active
                          ? 'border-line-strong bg-ink text-surface'
                          : 'border-line bg-canvas text-ink-secondary hover:border-line-strong'
                      }`}
                    >
                      {label.split(' (')[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-secondary">
                {t('simulator.stanceSelect')}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(dict.enums.stance).map(([key, label]) => {
                  const active = riderProfile.stanceMode === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRiderProfile({ stanceMode: key })}
                      className={`rounded-sm border px-2 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-line-strong bg-ink text-surface'
                          : 'border-line bg-canvas text-ink-secondary hover:border-line-strong'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-secondary">
                {t('simulator.modControlTitle')}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleMod('loweringLinkMm', 30)}
                  className={`rounded-sm border px-2.5 py-1.5 text-xs font-semibold tabular-telemetry ${
                    mods.loweringLinkMm > 0
                      ? 'border-signal bg-signal text-surface'
                      : 'border-line bg-canvas text-ink'
                  }`}
                >
                  {t('simulator.modLoweringLink')}
                </button>
                <button
                  type="button"
                  onClick={() => toggleMod('lowSeatMm', 25)}
                  className={`rounded-sm border px-2.5 py-1.5 text-xs font-semibold tabular-telemetry ${
                    mods.lowSeatMm > 0
                      ? 'border-signal bg-signal text-surface'
                      : 'border-line bg-canvas text-ink'
                  }`}
                >
                  {t('simulator.modLowSeat')}
                </button>
                <button
                  type="button"
                  onClick={() => toggleMod('barRiserMm', 30)}
                  className={`rounded-sm border px-2.5 py-1.5 text-xs font-semibold tabular-telemetry ${
                    mods.barRiserMm > 0
                      ? 'border-signal bg-signal text-surface'
                      : 'border-line bg-canvas text-ink'
                  }`}
                >
                  {t('simulator.modBarRiser')}
                </button>
              </div>
            </div>

            {evaluation.warnings.length > 0 && (
              <div className="border border-fit-tiptoe/40 bg-orange-50 px-3 py-2 text-xs text-fit-tiptoe">
                {evaluation.warnings.join(', ')}
              </div>
            )}
          </div>

          {/* Smart Upsell Bundle Action */}
          <div className="mt-6 border-t border-line pt-4">
            {topUpsell ? (
              <div className="border border-line-strong bg-canvas p-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-signal tabular-telemetry">
                  <span>{t('simulator.upsellTitle')}</span>
                  <span>+{topUpsell.fitScoreGain} FIT</span>
                </div>
                <div className="mt-1 text-sm font-bold text-ink">{topUpsell.title}</div>
                <div className="mt-1 text-xs text-ink-secondary tabular-telemetry">
                  {formatMm(topUpsell.afterSeatHeightMm)} ·{' '}
                  {formatVnd(topUpsell.estimatedTotalCostVnd, locale)}
                </div>
                {topUpsell.technicalNotes?.[0] && (
                  <p className="mt-1 text-[11px] text-ink-muted">{topUpsell.technicalNotes[0]}</p>
                )}
                <button
                  type="button"
                  disabled={bundleBusy || bike.availableQty <= 0}
                  onClick={() => handleAddUpsellCombo(topUpsell.accessoryIds)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm bg-signal px-4 py-2 text-xs font-bold text-surface hover:bg-signal-hover disabled:opacity-50"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  {bundleBusy
                    ? t('simulator.addingCombo')
                    : t('simulator.addComboBtn', {
                        total: formatVnd(
                          bike.priceVnd + (topUpsell.estimatedTotalCostVnd ?? 0),
                          locale
                        ),
                      })}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={bundleBusy || bike.availableQty <= 0}
                onClick={handleReserveBikeOnly}
                className="flex w-full items-center justify-center gap-2 rounded-sm bg-signal px-4 py-2.5 text-sm font-bold text-surface hover:bg-signal-hover disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4" />
                {t('bikeDetail.addToCart')}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
