'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Wrench } from 'lucide-react';
import { isSafeInternalUrl } from '@/lib/chat-markdown';
import { formatMm, formatVnd, getCategoryLabel, getFitStatusMeta } from '@/lib/formatters';
import { resolveClientMediaUrl } from '@/lib/media-helpers';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Technical Mini Rider-Fit Recommendation Card inside Chatbot Drawer.
 * Uses exact numbers computed by `@dirtfit/ergonomics-engine` and links directly to 2D Simulator.
 * Displays an optional compact real photo thumbnail when `bike.coverImageUrl` is live.
 * @param {object} props
 * @param {object} props.bike
 * @param {() => void} [props.onNavigate]
 * @returns {import('react').JSX.Element}
 */
export default function MiniFitCard({ bike, onNavigate }) {
  const { locale, t } = useI18n();
  const fitMeta = getFitStatusMeta(bike.contactStatus, locale);
  const safeHref = isSafeInternalUrl(bike.simulatorUrl) ? bike.simulatorUrl : `/bikes/${bike.slug}`;
  const thumbUrl = resolveClientMediaUrl(bike.coverImageUrl || bike.commercialImageUrl);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [thumbUrl]);

  return (
    <div className="rounded-sm border border-line bg-canvas p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {thumbUrl && !imgFailed && (
            <div className="h-10 w-14 shrink-0 overflow-hidden rounded-sm border border-line bg-surface">
              <img
                src={thumbUrl}
                alt={bike.name}
                loading="lazy"
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              {bike.brandName ? `${bike.brandName} · ` : ''}
              {getCategoryLabel(bike.category, locale)}
            </div>
            <div className="mt-0.5 truncate text-sm font-bold text-ink">{bike.name}</div>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${fitMeta.className}`}
        >
          {fitMeta.badge || fitMeta.label}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 border-y border-line py-2 text-[11px]">
        <div>
          <div className="text-ink-muted">{t('chat.effectiveSeatLabel')}</div>
          <div className="font-mono font-bold text-ink tabular-telemetry">
            {formatMm(bike.effectiveSeatHeightMm)}
          </div>
        </div>
        <div>
          <div className="text-ink-muted">{t('chat.riderSagLabel')}</div>
          <div className="font-mono font-bold text-ink tabular-telemetry">
            {formatMm(bike.riderSagMm)}
          </div>
        </div>
        <div>
          <div className="text-ink-muted">{t('chat.fitScoreLabel')}</div>
          <div className="font-mono font-bold text-ink tabular-telemetry">{bike.fitScore}/100</div>
        </div>
      </div>

      {bike.recommendedLoweringMm > 0 && bike.loweringTip && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-secondary">
          <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-signal" />
          <span>
            <strong className="font-mono text-ink">-{bike.recommendedLoweringMm}mm</strong>{' '}
            {bike.loweringTip}
          </span>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div>
          <div className="font-mono text-xs font-bold text-ink tabular-telemetry">
            {formatVnd(bike.priceVnd, locale)}
          </div>
          <div className="text-[10px] text-ink-muted tabular-telemetry">
            {t('common.stock')}: {bike.availableQty}
          </div>
        </div>
        <Link
          href={safeHref}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-sm border border-ink bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-surface transition-colors hover:border-signal hover:bg-signal"
        >
          <span>{t('chat.openSimulatorBtn')}</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
