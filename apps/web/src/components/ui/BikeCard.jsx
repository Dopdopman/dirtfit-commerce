import Link from 'next/link';
import { buildParametricWireframe, worldToSvg } from '@dirtfit/ergonomics-engine';
import ParametricBikeSvg from '@/components/simulator/ParametricBikeSvg';
import { getCategoryLabel, getFitStatusMeta, formatVnd } from '@/lib/formatters';

const CARD_VIEWPORT = Object.freeze({
  originSvgX: 72,
  originSvgY: 146,
  pxPerMm: 0.128,
});

/**
 * Clean 5-element Industrial Motorsport motorcycle catalog card.
 * @param {object} props
 * @param {object} props.bike
 * @returns {import('react').JSX.Element}
 */
export default function BikeCard({ bike }) {
  let svgWireframe = null;
  if (bike.geometrySpec) {
    const wireframeMm = buildParametricWireframe(bike.geometrySpec);
    const projectPt = (pt) => worldToSvg(pt, CARD_VIEWPORT);
    const scaleLen = (mm) => Math.round(mm * CARD_VIEWPORT.pxPerMm * 10) / 10;
    svgWireframe = {
      rearWheel: {
        center: projectPt(wireframeMm.rearWheel.center),
        tireRadiusPx: scaleLen(wireframeMm.rearWheel.tireRadiusMm),
        rimRadiusPx: scaleLen(wireframeMm.rearWheel.rimRadiusMm),
      },
      frontWheel: {
        center: projectPt(wireframeMm.frontWheel.center),
        tireRadiusPx: scaleLen(wireframeMm.frontWheel.tireRadiusMm),
        rimRadiusPx: scaleLen(wireframeMm.frontWheel.rimRadiusMm),
      },
      swingarm: wireframeMm.swingarm.map(projectPt),
      forkLine: wireframeMm.forkLine.map(projectPt),
      chassisLoop: wireframeMm.chassisLoop.map(projectPt),
      seatProfile: wireframeMm.seatProfile.map(projectPt),
      handlebar: wireframeMm.handlebar.map(projectPt),
      footpeg: projectPt(wireframeMm.footpeg),
      groundLine: wireframeMm.groundLine.map(projectPt),
    };
  }

  const fitMeta = bike.fitPreview ? getFitStatusMeta(bike.fitPreview.contactStatus) : null;

  return (
    <Link
      href={`/bikes/${bike.slug}`}
      className="group flex flex-col border border-line bg-surface transition-colors hover:border-line-strong"
    >
      {/* Element 1: Clean Side-Profile CAD Drafting Preview + Optional Single Fit Badge */}
      <div className="relative h-44 w-full overflow-hidden border-b border-line cad-grid-bg">
        {svgWireframe && (
          <svg
            viewBox="0 0 340 165"
            className="h-full w-full"
            aria-label={`${bike.name} side blueprint`}
          >
            <line
              x1="12"
              y1={CARD_VIEWPORT.originSvgY}
              x2="328"
              y2={CARD_VIEWPORT.originSvgY}
              stroke="#1C1E21"
              strokeOpacity="0.25"
              strokeWidth="1"
            />
            <ParametricBikeSvg svgWireframe={svgWireframe} />
          </svg>
        )}

        {fitMeta && (
          <div className="absolute left-2.5 top-2.5 flex flex-col gap-1">
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${fitMeta.className}`}
            >
              <span className="tabular-telemetry">{bike.fitPreview.fitScore}/100</span>
              <span>· {fitMeta.label}</span>
            </span>
            {bike.fitPreview.isModdableToFit && (
              <span className="inline-flex w-fit rounded-sm border border-line-strong bg-surface px-2 py-0.5 text-[10px] font-medium text-ink">
                Hợp khi lắp kit hạ yên
              </span>
            )}
          </div>
        )}
      </div>

      {/* Elements 2–5: Brand & Title, Category, 3 Monospace Metrics, VND Price */}
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-wider text-ink-secondary">
              {bike.brand?.name ?? 'DirtFit'}
            </span>
            <span className="tabular-telemetry">{bike.modelYear}</span>
          </div>

          <h3 className="mt-1 font-display text-lg font-bold tracking-tight text-ink group-hover:text-signal">
            {bike.name}
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">{getCategoryLabel(bike.category)}</p>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-3 border-y border-line py-2 text-xs text-ink-secondary tabular-telemetry">
            <span>{bike.geometrySpec?.unladenSeatHeightMm ?? '—'} mm yên</span>
            <span className="text-line-strong">·</span>
            <span>{bike.engineCc} cc</span>
            <span className="text-line-strong">·</span>
            <span>{bike.geometrySpec?.wetWeightKg ?? '—'} kg</span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-base font-bold text-ink tabular-telemetry">
                {formatVnd(bike.priceVnd)}
              </div>
              <div className="text-[11px] text-ink-muted tabular-telemetry">
                Cọc giữ xe: {formatVnd(bike.depositAmountVnd)}
              </div>
            </div>
            <span className="text-xs font-semibold text-ink-secondary">
              {bike.availableQty > 0 ? `Còn ${bike.availableQty} xe` : 'Hết hàng'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
