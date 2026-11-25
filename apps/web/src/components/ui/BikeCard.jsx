'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildParametricWireframe, worldToSvg } from '@dirtfit/ergonomics-engine';
import ParametricBikeSvg from '@/components/simulator/ParametricBikeSvg';
import { formatVnd, getCategoryLabel, getFitStatusMeta } from '@/lib/formatters';
import { getBikeCardMedia } from '@/lib/media-helpers';
import { useI18n } from '@/providers/I18nProvider';

const CARD_VIEWPORT = Object.freeze({
  originSvgX: 72,
  originSvgY: 146,
  pxPerMm: 0.128,
});

/**
 * Clean 5-element Industrial Motorsport motorcycle catalog card.
 * Displays real cover photo when live, or falls back smoothly to 2D Parametric Wireframe SVG.
 * @param {object} props
 * @param {object} props.bike
 * @returns {import('react').JSX.Element}
 */
export default function BikeCard({ bike }) {
  const { locale, t } = useI18n();
  const { coverUrl, hasRealPhoto } = getBikeCardMedia(bike);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [coverUrl]);

  const showRealPhoto = Boolean(hasRealPhoto && coverUrl && !imgFailed);

  let svgWireframe = null;
  if (!showRealPhoto && bike.geometrySpec) {
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

  const fitMeta = bike.fitPreview ? getFitStatusMeta(bike.fitPreview.contactStatus, locale) : null;

  return (
    <Link
      href={`/bikes/${bike.slug}`}
      className="group flex flex-col border border-line bg-surface transition-colors hover:border-line-strong"
    >
      {/* Element 1: Real Cover Photo or Clean 2D Side-Profile CAD Drafting Preview */}
      <div
        className={`relative aspect-[16/10] w-full overflow-hidden border-b border-line ${
          showRealPhoto ? 'bg-canvas' : 'cad-grid-bg'
        }`}
      >
        {showRealPhoto ? (
          <img
            src={coverUrl}
            alt={bike.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          svgWireframe && (
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
          )
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
                {t('catalog.afterModsLabel')} Fit
              </span>
            )}
          </div>
        )}

        <div className="absolute bottom-2 right-2 rounded-sm border border-line-strong bg-surface/90 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-ink-secondary">
          {showRealPhoto ? t('media.fitReadyBadge') : t('media.specPreviewBadge')}
        </div>
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
          <p className="mt-0.5 text-xs text-ink-muted">{getCategoryLabel(bike.category, locale)}</p>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-3 border-y border-line py-2 text-xs text-ink-secondary tabular-telemetry">
            <span>
              {bike.geometrySpec?.unladenSeatHeightMm ?? '—'} mm {t('catalog.seatLabel')}
            </span>
            <span className="text-line-strong">·</span>
            <span>
              {bike.engineCc} {t('bikeDetail.ccUnit')}
            </span>
            <span className="text-line-strong">·</span>
            <span>{bike.geometrySpec?.wetWeightKg ?? '—'} kg</span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-base font-bold text-ink tabular-telemetry">
                {formatVnd(bike.priceVnd, locale)}
              </div>
              <div className="text-[11px] text-ink-muted tabular-telemetry">
                {t('catalog.depositFrom', { amount: formatVnd(bike.depositAmountVnd, locale) })}
              </div>
            </div>
            <span className="text-xs font-semibold text-ink-secondary">
              {bike.availableQty > 0
                ? t('common.unitsLeft', { count: bike.availableQty })
                : t('common.outOfStock')}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
