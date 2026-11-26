'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import ProductThumbnail from '@/components/ui/ProductThumbnail';
import { isSafeInternalUrl } from '@/lib/chat-markdown';
import { formatMm, formatVnd, getCategoryLabel } from '@/lib/formatters';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Compact clickable Motorcycle Card inside Chatbot Drawer for GENERAL_PURCHASE & CATALOG_PRICING.
 * Reuses ProductThumbnail (real R2 photo or crisp CAD wireframe fallback) and routes straight to `/bikes/[slug]`.
 * @param {object} props
 * @param {object} props.bike
 * @param {() => void} [props.onNavigate]
 * @returns {import('react').JSX.Element}
 */
export default function CompactBikeCard({ bike, onNavigate }) {
  const { locale, t } = useI18n();
  const safeHref = isSafeInternalUrl(bike.productUrl) ? bike.productUrl : `/bikes/${bike.slug}`;
  const brandLabel = bike.brandName || bike.brand || null;
  const seatMm = bike.seatHeightMm ?? bike.unladenSeatHeightMm;
  const availableQty = Number(bike.availableQty ?? 0);

  return (
    <Link
      href={safeHref}
      onClick={onNavigate}
      data-testid="chat-compact-bike-card"
      aria-label={t('chat.viewBikeAria', { name: bike.name })}
      className="group flex items-center gap-2.5 rounded-sm border border-line bg-canvas p-2 transition-colors hover:border-signal hover:bg-surface"
    >
      <ProductThumbnail
        itemType="BIKE"
        src={bike.coverImageUrl || bike.commercialImageUrl}
        alt={bike.name}
        size="sm"
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          {brandLabel ? `${brandLabel} · ` : ''}
          {getCategoryLabel(bike.category, locale)}
          {bike.engineCc ? ` · ${bike.engineCc}cc` : ''}
        </div>
        <div className="truncate text-xs font-bold text-ink transition-colors group-hover:text-signal">
          {bike.name}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-mono text-xs font-bold text-ink tabular-telemetry">
            {formatVnd(bike.priceVnd, locale)}
          </span>
          {typeof seatMm === 'number' && seatMm > 0 && (
            <span className="font-mono text-[10px] text-ink-muted tabular-telemetry">
              {t('chat.seatShortLabel')} {formatMm(seatMm)}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 text-[10px] tabular-telemetry ${
              availableQty > 0 ? 'text-emerald-700' : 'text-ink-muted'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                availableQty > 0 ? 'bg-emerald-500' : 'bg-zinc-400'
              }`}
              aria-hidden="true"
            />
            {availableQty > 0
              ? t('chat.inStockShort', { count: availableQty })
              : t('chat.outOfStockShort')}
          </span>
        </div>
      </div>

      <ArrowUpRight
        className="h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-signal"
        aria-hidden="true"
      />
    </Link>
  );
}
