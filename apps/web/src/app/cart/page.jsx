'use client';

import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatVnd } from '@/lib/formatters';
import { useCart } from '@/providers/AppProviders';

/**
 * Shopping Cart page separating bike deposits, installation labor, and COD eligibility.
 * @returns {import('react').JSX.Element}
 */
export default function CartPage() {
  const { cart, cartLoading, updateItemQty, removeItem, clearCart } = useCart();

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
            GIỎ HÀNG & COMBO ĐƠN HÀNG
          </div>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink">
            Giỏ hàng của bạn ({cart?.itemCount ?? 0})
          </h1>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className="text-xs font-semibold text-ink-muted underline hover:text-fit-unsafe"
          >
            Xóa toàn bộ giỏ hàng
          </button>
        )}
      </div>

      {cartLoading && items.length === 0 ? (
        <div className="border border-line bg-surface p-8 text-sm text-ink-secondary">
          Đang tải giỏ hàng...
        </div>
      ) : items.length === 0 ? (
        <div className="border border-line bg-surface p-10 text-center">
          <p className="text-sm text-ink-secondary">Giỏ hàng của bạn hiện đang trống.</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/bikes"
              className="rounded-sm bg-signal px-5 py-2.5 text-sm font-bold text-surface hover:bg-signal-hover"
            >
              Khám phá danh mục xe
            </Link>
            <Link
              href="/accessories"
              className="rounded-sm border border-line-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink hover:bg-canvas"
            >
              Xem phụ kiện hạ yên
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-4 border border-line bg-surface p-5 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    <span
                      className={item.itemType === 'BIKE' ? 'text-signal' : 'text-ink-secondary'}
                    >
                      {item.itemType === 'BIKE' ? 'XE MÁY ĐỊA HÌNH' : 'PHỤ KIỆN / HẠ YÊN'}
                    </span>
                    {item.bundleGroupId && (
                      <span className="rounded-sm border border-signal/30 bg-orange-50 px-1.5 py-0.5 text-[10px] text-signal">
                        COMBO SIMULATOR
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 font-display text-lg font-bold text-ink">
                    {item.product?.name ?? 'Sản phẩm'}
                  </h2>
                  <div className="mt-1 text-xs text-ink-secondary tabular-telemetry">
                    Đơn giá: {formatVnd(item.unitPriceVnd)}
                    {item.installLaborVnd > 0 && ` · Công lắp: ${formatVnd(item.installLaborVnd)}`}
                    {item.itemType === 'BIKE' && ` · Cọc: ${formatVnd(item.depositAmountVnd)}/xe`}
                  </div>
                  <div className="mt-1 text-[11px] text-ink-muted tabular-telemetry">
                    {item.inStock
                      ? `Sẵn kho: ${item.availableQty}`
                      : `Cảnh báo: chỉ còn ${item.availableQty} trong kho`}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center border border-line bg-canvas">
                    <button
                      type="button"
                      aria-label="Giảm số lượng"
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
                      aria-label="Tăng số lượng"
                      disabled={item.quantity >= item.availableQty}
                      onClick={() => updateItemQty(item.id, item.quantity + 1)}
                      className="p-2 text-ink-secondary hover:text-ink disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="w-32 text-right font-bold text-ink tabular-telemetry">
                    {formatVnd(item.lineTotalVnd)}
                  </div>

                  <button
                    type="button"
                    aria-label="Xóa khỏi giỏ"
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-ink-muted hover:text-fit-unsafe"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Panel */}
          <aside className="h-fit border border-line-strong bg-surface p-6 lg:col-span-4">
            <h2 className="font-display text-lg font-bold text-ink">Tóm tắt đơn hàng</h2>

            <dl className="mt-4 space-y-2.5 border-y border-line py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-secondary">Tạm tính hàng hóa</dt>
                <dd className="font-medium tabular-telemetry">{formatVnd(summary.subtotalVnd)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-secondary">Công lắp đặt tại xưởng</dt>
                <dd className="font-medium tabular-telemetry">
                  {formatVnd(summary.installLaborTotalVnd)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2.5 text-base font-bold text-ink">
                <dt>Tổng giá trị đơn</dt>
                <dd className="tabular-telemetry">{formatVnd(summary.totalVnd)}</dd>
              </div>
              {cart?.hasBike && (
                <>
                  <div className="flex justify-between text-signal">
                    <dt className="font-semibold">Thanh toán cọc ngay</dt>
                    <dd className="font-bold tabular-telemetry">
                      {formatVnd(summary.depositPayableNowVnd)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-xs text-ink-muted">
                    <dt>Thanh toán khi nhận xe</dt>
                    <dd className="tabular-telemetry">{formatVnd(summary.remainingBalanceVnd)}</dd>
                  </div>
                </>
              )}
            </dl>

            <div className="mt-4 text-xs text-ink-secondary">
              {cart?.hasBike
                ? 'Lưu ý: Đơn hàng có xe máy bắt buộc đặt cọc/thanh toán online (PayOS VietQR hoặc Mock Sandbox), không hỗ trợ COD.'
                : summary.codEligible
                  ? 'Đơn thuần phụ kiện dưới 20.000.000 ₫ đủ điều kiện thanh toán COD.'
                  : 'Đơn phụ kiện vượt quá hạn mức COD 20.000.000 ₫, vui lòng thanh toán online.'}
            </div>

            <Link
              href="/checkout"
              className="mt-5 block w-full rounded-sm bg-signal px-5 py-3 text-center text-sm font-bold text-surface hover:bg-signal-hover"
            >
              Tiến hành thanh toán
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
