'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Calendar, ShieldCheck } from 'lucide-react';
import BikePhotoGallery from '@/components/catalog/BikePhotoGallery';
import RiderFitSimulator from '@/components/simulator/RiderFitSimulator';
import BikeSpecTabs from '@/components/ui/BikeSpecTabs';
import SpecDrawer from '@/components/ui/SpecDrawer';
import { formatMm, formatVnd, getCategoryLabel, getRidingFocusLabel } from '@/lib/formatters';
import { getBikeSummary } from '@/lib/i18n/translate';
import { useCart } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * 3-Tier Progressive Disclosure Motorcycle Detail Client Workbench.
 * Tier 1: Real Photo Gallery (left) + Hero summary, pricing, key specs & primary CTA (right).
 * Tier 2: Interactive 2D Parametric Rider Fit Workbench (#simulator, always visible on load).
 * Tier 3: Specification Tabs + Full Telemetry Drawer.
 * @param {object} props
 * @param {object} props.bike
 * @returns {import('react').JSX.Element}
 */
export default function BikeDetailClient({ bike }) {
  const router = useRouter();
  const { addItem } = useCart();
  const { locale, t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const g = bike.geometrySpec ?? {};
  const summaryText = getBikeSummary(bike, locale);

  const handlePrimaryReserve = async () => {
    setSubmitting(true);
    try {
      await addItem({ itemType: 'BIKE', bikeId: bike.id, quantity: 1 });
      router.push('/cart');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAccessory = async (accessoryId) => {
    await addItem({ itemType: 'ACCESSORY', accessoryId, quantity: 1 });
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-ink-muted">
        <Link href="/bikes" className="hover:text-ink">
          {t('bikeDetail.breadcrumbBikes')}
        </Link>
        <span>/</span>
        <span className="font-medium text-ink">{bike.name}</span>
      </nav>

      {/* Tier 1: Real Photo Gallery + Above-the-Fold Hero Summary & Single Primary CTA */}
      <section className="grid gap-8 border border-line bg-surface p-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <BikePhotoGallery bike={bike} />
        </div>

        <div className="flex flex-col justify-between border-t border-line pt-6 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
              <span className="text-signal">{bike.brand?.name}</span>
              <span>·</span>
              <span>{getCategoryLabel(bike.category, locale)}</span>
              <span>·</span>
              <span>{getRidingFocusLabel(bike.ridingFocus, locale)}</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {bike.name}{' '}
              <span className="text-lg font-semibold text-ink-muted tabular-telemetry">
                {bike.modelYear}
              </span>
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-secondary">{summaryText}</p>

            {/* Compact 4-Metric Spec Strip */}
            <div className="mt-5 grid grid-cols-2 gap-3 border-y border-line py-4 sm:grid-cols-4 lg:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-muted">
                  {t('bikeDetail.specRows.unladenSeatHeightMm')}
                </div>
                <div className="mt-0.5 text-base font-bold text-ink tabular-telemetry">
                  {formatMm(g.unladenSeatHeightMm)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-muted">
                  {t('bikeDetail.specRows.seatWidthMm')}
                </div>
                <div className="mt-0.5 text-base font-bold text-ink tabular-telemetry">
                  {formatMm(g.seatWidthMm)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-muted">
                  {t('bikeDetail.specRows.wetWeightKg')}
                </div>
                <div className="mt-0.5 text-base font-bold text-ink tabular-telemetry">
                  {g.wetWeightKg} kg
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-muted">CC</div>
                <div className="mt-0.5 text-base font-bold text-ink tabular-telemetry">
                  {bike.engineCc} {t('bikeDetail.ccUnit')}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {t('common.price')}
              </div>
              <div className="mt-1 text-3xl font-extrabold text-ink tabular-telemetry">
                {formatVnd(bike.priceVnd, locale)}
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-ink-secondary tabular-telemetry">
                <span>
                  {t('bikeDetail.depositLabel', {
                    amount: formatVnd(bike.depositAmountVnd, locale),
                  })}
                </span>
              </div>
              <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-sm border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-ink-secondary">
                <ShieldCheck className="h-3.5 w-3.5 text-fit-flat" />
                <span>
                  {bike.availableQty > 0
                    ? t('bikeDetail.stockInWarehouse', { count: bike.availableQty })
                    : t('common.outOfStock')}
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={submitting || bike.availableQty <= 0}
                onClick={handlePrimaryReserve}
                className="w-full rounded-sm bg-signal px-5 py-3 text-sm font-bold text-surface transition-colors hover:bg-signal-hover disabled:opacity-50"
              >
                {bike.availableQty > 0
                  ? `${t('bikeDetail.depositCheckout')} (${formatVnd(bike.depositAmountVnd, locale)})`
                  : t('common.outOfStock')}
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <Link
                  href={`/test-ride?bikeId=${bike.id}`}
                  className="flex items-center justify-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-canvas"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{t('bikeDetail.bookTestRide')}</span>
                </Link>
                <Link
                  href={`/compare?bikeA=${bike.slug}`}
                  className="flex items-center justify-center gap-1.5 rounded-sm border border-line bg-canvas px-3 py-2 text-xs font-semibold text-ink-secondary hover:border-line-strong hover:text-ink"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  <span>{t('bikeDetail.compareGhost')}</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tier 2: Interactive 2D Parametric Rider Fit Workbench */}
      <RiderFitSimulator bike={bike} />

      {/* Tier 3: Specification Tabs + Full Telemetry Drawer */}
      <BikeSpecTabs
        bike={bike}
        onOpenDrawer={() => setDrawerOpen(true)}
        onAddAccessory={handleAddAccessory}
      />

      <SpecDrawer bike={bike} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
