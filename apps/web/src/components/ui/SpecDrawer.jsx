'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { formatMm, formatVnd, getCategoryLabel, getRidingFocusLabel } from '@/lib/formatters';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Slide-over technical specification drawer powered by Radix Dialog (Tier 3 Progressive Disclosure).
 * @param {object} props
 * @param {object} props.bike
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @returns {import('react').JSX.Element}
 */
export default function SpecDrawer({ bike, open, onOpenChange }) {
  const { locale, t } = useI18n();
  const g = bike?.geometrySpec ?? {};

  const rows = [
    [t('adminBikeDetail.fields.category'), getCategoryLabel(bike.category, locale)],
    [t('adminBikeDetail.fields.ridingFocus'), getRidingFocusLabel(bike.ridingFocus, locale)],
    ['Engine', `${bike.engineCc} ${t('bikeDetail.ccUnit')}`],
    [
      t('common.status'),
      bike.streetLegal ? t('common.streetLegalYes') : t('common.trackOnlyNoPlate'),
    ],
    [t('bikeDetail.specRows.unladenSeatHeightMm'), formatMm(g.unladenSeatHeightMm)],
    [t('bikeDetail.specRows.seatWidthMm'), formatMm(g.seatWidthMm)],
    [t('bikeDetail.specRows.wheelbaseMm'), formatMm(g.wheelbaseMm)],
    [t('bikeDetail.specRows.groundClearanceMm'), formatMm(g.groundClearanceMm)],
    [t('bikeDetail.specRows.frontTravelMm'), formatMm(g.frontTravelMm)],
    [t('bikeDetail.specRows.rearTravelMm'), formatMm(g.rearTravelMm)],
    [
      `${t('bikeDetail.specRows.staticSagFrontMm')} / ${t('bikeDetail.specRows.staticSagRearMm')}`,
      `${g.staticSagFrontMm ?? '—'} / ${g.staticSagRearMm ?? '—'} mm`,
    ],
    [
      `${t('bikeDetail.specRows.frontWheelDiameterIn')} / ${t('bikeDetail.specRows.rearWheelDiameterIn')}`,
      `${g.frontWheelDiameterIn ?? '—'}" / ${g.rearWheelDiameterIn ?? '—'}"`,
    ],
    [
      `${t('bikeDetail.specRows.rakeDeg')} / ${t('bikeDetail.specRows.trailMm')}`,
      `${g.rakeDeg ?? '—'}° / ${g.trailMm ?? '—'} mm`,
    ],
    [t('bikeDetail.specRows.wetWeightKg'), `${g.wetWeightKg ?? '—'} kg`],
    [t('bikeDetail.specRows.fuelCapacityL'), `${g.fuelCapacityL ?? '—'} L`],
    [t('common.price'), formatVnd(bike.priceVnd, locale)],
    [
      t('bikeDetail.depositLabel', { amount: '' }).replace(/:\s*$/, ''),
      formatVnd(bike.depositAmountVnd, locale),
    ],
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line-strong bg-surface shadow-xl focus:outline-none">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <div>
              <Dialog.Title className="font-display text-lg font-bold text-ink">
                {t('bikeDetail.drawerTitle')}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-ink-muted">
                {t('bikeDetail.drawerSubtitle', { name: bike.name, sku: bike.sku })}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t('common.close')}
              className="rounded-sm border border-line p-1.5 text-ink-secondary hover:border-line-strong hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <dl className="divide-y divide-line">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <dt className="text-ink-secondary">{label}</dt>
                  <dd className="text-right font-medium text-ink tabular-telemetry">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
