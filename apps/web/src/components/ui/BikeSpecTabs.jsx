'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { formatMm, formatVnd, getCategoryLabel, getRidingFocusLabel } from '@/lib/formatters';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Tier-3 Progressive Disclosure technical specification tabs powered by Radix Tabs.
 * @param {object} props
 * @param {object} props.bike
 * @param {() => void} props.onOpenDrawer
 * @param {(accessoryId: string) => void} props.onAddAccessory
 * @returns {import('react').JSX.Element}
 */
export default function BikeSpecTabs({ bike, onOpenDrawer, onAddAccessory }) {
  const { locale, t } = useI18n();
  const g = bike.geometrySpec ?? {};
  const compatibilities = bike.compatibilities ?? [];

  return (
    <section className="mt-12 border border-line bg-surface">
      <Tabs.Root defaultValue="geometry">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 sm:px-6">
          <Tabs.List
            aria-label={t('bikeDetail.specSpecsTab')}
            className="flex flex-wrap gap-6 text-sm font-medium"
          >
            <Tabs.Trigger
              value="geometry"
              className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
            >
              {t('bikeDetail.specErgonomicsTab')}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="engine"
              className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
            >
              {t('bikeDetail.specSpecsTab')}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="parts"
              className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
            >
              {t('bikeDetail.specModsTab', { count: compatibilities.length })}
            </Tabs.Trigger>
          </Tabs.List>

          <button
            type="button"
            onClick={onOpenDrawer}
            className="my-2 rounded-sm border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-canvas"
          >
            {t('bikeDetail.openDrawerBtn')}
          </button>
        </div>

        <Tabs.Content value="geometry" className="grid gap-6 p-6 sm:grid-cols-3">
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">
              {t('bikeDetail.specRows.unladenSeatHeightMm')} /{' '}
              {t('bikeDetail.specRows.seatWidthMm')}
            </div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {formatMm(g.unladenSeatHeightMm)} / {formatMm(g.seatWidthMm)}
            </div>
          </div>
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">
              {t('bikeDetail.specRows.frontTravelMm')} / {t('bikeDetail.specRows.rearTravelMm')}
            </div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {formatMm(g.frontTravelMm)} / {formatMm(g.rearTravelMm)}
            </div>
          </div>
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">
              {t('bikeDetail.specRows.wheelbaseMm')} / {t('bikeDetail.specRows.groundClearanceMm')}
            </div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {formatMm(g.wheelbaseMm)} / {formatMm(g.groundClearanceMm)}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="engine" className="grid gap-6 p-6 sm:grid-cols-3">
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">
              CC / {t('adminBikeDetail.fields.category')}
            </div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {bike.engineCc} {t('bikeDetail.ccUnit')}
            </div>
            <div className="mt-1 text-xs text-ink-secondary">
              {getCategoryLabel(bike.category, locale)}
            </div>
          </div>
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">
              {t('bikeDetail.specRows.wetWeightKg')} &amp; {t('bikeDetail.specRows.fuelCapacityL')}
            </div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {g.wetWeightKg} kg · {g.fuelCapacityL ?? '—'} L
            </div>
            <div className="mt-1 text-xs text-ink-secondary">
              {getRidingFocusLabel(bike.ridingFocus, locale)}
            </div>
          </div>
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">
              Target Rider Sag &amp; {t('bikeDetail.specRows.seatFoamFirmness')}
            </div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {Math.round((g.targetRiderSagRatio ?? 0.33) * 100)}% · {g.seatFoamFirmness}
            </div>
            <div className="mt-1 text-xs text-ink-secondary">
              Rake {g.rakeDeg ?? '—'}&deg; · Trail {g.trailMm ?? '—'} mm
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="parts" className="p-6">
          {compatibilities.length === 0 ? (
            <p className="text-sm text-ink-secondary">{t('bikeDetail.noCompatibleMods')}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {compatibilities.map((comp) => (
                <div
                  key={comp.id}
                  className="flex flex-col justify-between gap-3 border border-line bg-canvas p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="font-semibold text-ink">{comp.accessory?.name}</div>
                    <div className="mt-1 text-xs text-ink-secondary">
                      {comp.exactSeatDropMm
                        ? t('bikeDetail.seatDropNote', { mm: comp.exactSeatDropMm })
                        : comp.fitmentNotes || 'OEM Fitment'}
                      {comp.requiresWorkshopInstall ? ` · ${t('bikeDetail.workshopInstall')}` : ''}
                    </div>
                    <div className="mt-1.5 text-xs font-medium text-ink tabular-telemetry">
                      {formatVnd(comp.accessory?.priceVnd ?? 0, locale)}
                      {comp.installLaborVnd > 0 && ` (+${formatVnd(comp.installLaborVnd, locale)})`}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={(comp.availableQty ?? 0) <= 0}
                    onClick={() => onAddAccessory(comp.accessoryId)}
                    className="shrink-0 rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink hover:text-surface disabled:opacity-40"
                  >
                    {(comp.availableQty ?? 0) > 0
                      ? t('bikeDetail.addAccessoryBtn')
                      : t('common.outOfStock')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}
