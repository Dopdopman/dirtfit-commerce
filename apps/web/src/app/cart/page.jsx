'use client';

import Link from 'next/link';
import { ArrowUpRight, Minus, Plus, Trash2 } from 'lucide-react';
import ProductThumbnail from '@/components/ui/ProductThumbnail';
import { formatVnd } from '@/lib/formatters';
import { resolveItemProductUrl } from '@/lib/media-helpers';
import { useCart } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Shopping Cart page separating bike deposits, installation labor, COD eligibility,
 * clickable thumbnails, and product deep-links (`/bikes/[slug]`, `/accessories?sku=...`).
 * @returns {import('react').JSX.Element}
 */
export default function CartPage() {
  const { cart, cartLoading, updateItemQty, removeItem, clearCart } = useCart();
  const { locale, t } = useI18n();

  const items = cart?.items ?? [];
  const summary = cart?.summary ?? {
    subtotalVnd: 0,
    installLaborTotalVnd: 0,
    totalVnd: 0,
    depositPayableNowVnd: 0,
    remainingBalanceVnd: 0,
    codEligible: true,
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
            {t('cart.kicker')}
          </div>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink">
            {t('cart.title')} ({cart?.itemCount ?? 0})
          </h1>
          <p className="mt-1 text-xs text-ink-secondary">{t('cart.subtitle')}</p>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className="text-xs font-semibold text-ink-muted underline hover:text-fit-unsafe"
          >
            {t('cart.clearCart')}
          </button>
        )}
      </div>

      {cartLoading && items.length === 0 ? (
        <div className="border border-line bg-surface p-8 text-sm text-ink-secondary">
          {t('common.loading')}
        </div>
      ) : items.length === 0 ? (
        <div className="border border-line bg-surface p-10 text-center">
          <p className="text-base font-semibold text-ink">{t('cart.emptyTitle')}</p>
          <p className="mt-1 text-sm text-ink-secondary">{t('cart.emptyBody')}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/bikes"
              className="rounded-sm bg-signal px-5 py-2.5 text-sm font-bold text-surface hover:bg-signal-hover"
            >
              {t('cart.browseBikes')}
            </Link>
            <Link
              href="/accessories"
              className="rounded-sm border border-line-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink hover:bg-canvas"
            >
              {t('cart.browseAccessories')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            {items.map((item) => {
              const productUrl = resolveItemProductUrl(item);
              const imageUrl = item.imageUrl ?? item.product?.imageUrl ?? null;
              const sku = item.sku ?? item.product?.sku ?? null;
              const brandLabel = item.brandName ?? item.brand ?? item.product?.brandName ?? null;
              const displayName = item.product?.name ?? item.itemType;

              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-4 border border-line bg-surface p-5 sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-4">
                    <ProductThumbnail
                      itemType={item.itemType}
                      size="md"
                      src={imageUrl}
                      alt={displayName}
                      sku={sku}
                      href={productUrl}
                    />

                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                        <span
                          className={
                            item.itemType === 'BIKE' ? 'text-signal' : 'text-ink-secondary'
                          }
                        >
                          {item.itemType === 'BIKE'
                            ? t('cart.itemTypeBike')
                            : t('cart.itemTypeAccessory')}
                        </span>
                        {item.bundleGroupId && (
                          <span className="rounded-sm border border-signal/30 bg-orange-50 px-1.5 py-0.5 text-[10px] text-signal">
                            COMBO SIMULATOR
                          </span>
                        )}
                      </div>

                      <h2 className="mt-1 font-display text-lg font-bold text-ink">
                        <Link href={productUrl} className="hover:text-signal hover:underline">
                          {displayName}
                        </Link>
                      </h2>

                      {(brandLabel || sku) && (
                        <div className="mt-0.5 font-mono text-[11px] text-ink-muted">
                          {[brandLabel, sku].filter(Boolean).join(' · ')}
                        </div>
                      )}

                      <div className="mt-1 text-xs text-ink-secondary tabular-telemetry">
                        {t('cart.unitPrice')}: {formatVnd(item.unitPriceVnd, locale)}
                        {item.installLaborVnd > 0 &&
                          ` · +${formatVnd(item.installLaborVnd, locale)}`}
                        {item.itemType === 'BIKE' &&
                          ` · ${t('bikeDetail.depositLabel', { amount: formatVnd(item.depositAmountVnd, locale) })}`}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
                        <span className="text-ink-muted tabular-telemetry">
                          {item.inStock
                            ? t('cart.availableHint', { avail: item.availableQty })
                            : t('cart.stockWarning', {
                                avail: item.availableQty,
                                qty: item.quantity,
                              })}
                        </span>
                        <Link
                          href={productUrl}
                          className="inline-flex items-center gap-0.5 font-semibold text-signal hover:underline"
                        >
                          <span>
                            {item.itemType === 'BIKE'
                              ? t('cart.viewBike')
                              : t('cart.viewAccessory')}
                          </span>
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center border border-line bg-canvas">
                      <button
                        type="button"
                        aria-label="-"
                        disabled={item.quantity <= 1}
                        onClick={() => updateItemQty(item.id, item.quantity - 1)}
                        className="p-2 text-ink-secondary hover:text-ink disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold tabular-telemetry">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="+"
                        disabled={item.quantity >= item.availableQty}
                        onClick={() => updateItemQty(item.id, item.quantity + 1)}
                        className="p-2 text-ink-secondary hover:text-ink disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="w-36 text-right font-bold text-ink tabular-telemetry">
                      {formatVnd(item.lineTotalVnd, locale)}
                    </div>

                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 text-ink-muted hover:text-fit-unsafe"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary Panel */}
          <aside className="h-fit border border-line-strong bg-surface p-6 lg:col-span-4">
            <h2 className="font-display text-lg font-bold text-ink">{t('cart.summaryTitle')}</h2>

            <dl className="mt-4 space-y-2.5 border-y border-line py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-secondary">{t('cart.subtotalLabel')}</dt>
                <dd className="font-medium tabular-telemetry">
                  {formatVnd(summary.subtotalVnd, locale)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-secondary">{t('adminBikeDetail.compatCols.labor')}</dt>
                <dd className="font-medium tabular-telemetry">
                  {formatVnd(summary.installLaborTotalVnd, locale)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2.5 text-base font-bold text-ink">
                <dt>{t('checkout.totalOrderValue')}</dt>
                <dd className="tabular-telemetry">{formatVnd(summary.totalVnd, locale)}</dd>
              </div>
              {cart?.hasBike && (
                <>
                  <div className="flex justify-between text-signal">
                    <dt className="font-semibold">{t('checkout.payableNow')}</dt>
                    <dd className="font-bold tabular-telemetry">
                      {formatVnd(summary.depositPayableNowVnd, locale)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-xs text-ink-muted">
                    <dt>{t('checkout.remainingBalance')}</dt>
                    <dd className="tabular-telemetry">
                      {formatVnd(summary.remainingBalanceVnd, locale)}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            <div className="mt-4 text-xs text-ink-secondary">
              {cart?.hasBike ? t('cart.bikeDepositNote') : t('cart.accessoryCodNote')}
            </div>

            <Link
              href="/checkout"
              className="mt-5 block w-full rounded-sm bg-signal px-5 py-3 text-center text-sm font-bold text-surface hover:bg-signal-hover"
            >
              {t('cart.proceedCheckout')}
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
