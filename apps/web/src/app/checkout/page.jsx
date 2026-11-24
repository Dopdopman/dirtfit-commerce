'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Lock, ShieldAlert } from 'lucide-react';
import { ShippingAddressSchema } from '@dirtfit/shared';
import { apiRequest } from '@/lib/api-client';
import { formatVnd, getOrderStatusMeta } from '@/lib/formatters';
import { useAuth, useCart, useRiderProfile } from '@/providers/AppProviders';

/**
 * 1-Page Checkout with Idempotency-Key, COD rule enforcement, and non-prod Mock payment completion.
 * @returns {import('react').JSX.Element}
 */
export default function CheckoutPage() {
  const { user, authReady } = useAuth();
  const { cart, refreshCart } = useCart();
  const { riderProfile } = useRiderProfile();

  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ck-${Date.now()}`
  );
  const [orderType, setOrderType] = useState('BIKE_DEPOSIT');
  const [paymentMethod, setPaymentMethod] = useState('MOCK');
  const [address, setAddress] = useState({
    recipientName: '',
    phone: '',
    province: 'TP. Hồ Chí Minh',
    district: 'TP. Thủ Đức',
    ward: 'Linh Trung',
    streetAddress: '',
  });
  const [customerNote, setCustomerNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [completingMock, setCompletingMock] = useState(false);

  const hasBike = Boolean(cart?.hasBike);
  const codAllowed = Boolean(cart?.summary?.codEligible) && !hasBike;

  useEffect(() => {
    if (user && !address.recipientName) {
      setAddress((prev) => ({
        ...prev,
        recipientName: user.fullName || '',
        phone: user.phone || '',
      }));
    }
  }, [user, address.recipientName]);

  useEffect(() => {
    if (!cart) return;
    if (hasBike) {
      setOrderType((prev) => (prev === 'ACCESSORY_ONLY' ? 'BIKE_DEPOSIT' : prev));
      setPaymentMethod((prev) => (prev === 'COD' ? 'MOCK' : prev));
    } else {
      setOrderType('ACCESSORY_ONLY');
    }
  }, [cart, hasBike]);

  const payablePreview = useMemo(() => {
    if (!cart?.summary) return 0;
    if (!hasBike) return cart.summary.totalVnd;
    return orderType === 'BIKE_DEPOSIT' ? cart.summary.depositPayableNowVnd : cart.summary.totalVnd;
  }, [cart, hasBike, orderType]);

  const handleCheckout = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const validatedAddress = ShippingAddressSchema.safeParse(address);
    if (!validatedAddress.success) {
      setErrorMsg(
        validatedAddress.error.issues[0]?.message || 'Vui lòng kiểm tra lại thông tin giao nhận.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiRequest('/api/v1/orders/checkout', {
        method: 'POST',
        headers: {
          'idempotency-key': idempotencyKey,
        },
        body: {
          orderType: hasBike ? orderType : 'ACCESSORY_ONLY',
          paymentMethod,
          shippingAddress: validatedAddress.data,
          riderFitSnapshot: riderProfile,
          customerNote: customerNote.trim() || undefined,
        },
      });
      setPlacedOrder(result.order);
      setPaymentIntent(result.payment);
      await refreshCart();
    } catch (err) {
      setErrorMsg(err?.detail || 'Không thể tạo đơn hàng.');
      if (err?.code === 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' && crypto?.randomUUID) {
        setIdempotencyKey(crypto.randomUUID());
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteMockPayment = async () => {
    if (!placedOrder) return;
    setCompletingMock(true);
    setErrorMsg('');
    try {
      const res = await apiRequest('/api/v1/payments/mock/complete', {
        method: 'POST',
        body: {
          orderId: placedOrder.id,
          outcome: 'SUCCEEDED',
        },
      });
      setPlacedOrder(res.order);
    } catch (err) {
      setErrorMsg(err?.detail || 'Không thể hoàn tất thanh toán giả lập.');
    } finally {
      setCompletingMock(false);
    }
  };

  if (!authReady) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-10 text-sm text-ink-secondary sm:px-6">
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (!user && !placedOrder) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
        <div className="border border-line-strong bg-surface p-8 text-center">
          <Lock className="mx-auto h-7 w-7 text-signal" />
          <h1 className="mt-3 font-display text-2xl font-bold text-ink">
            Đăng nhập để hoàn tất đặt hàng
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Giỏ hàng hiện tại của bạn sẽ được đồng bộ tự động ngay khi đăng nhập.
          </p>
          <Link
            href="/login?next=/checkout"
            className="mt-5 inline-block rounded-sm bg-signal px-6 py-2.5 text-sm font-bold text-surface hover:bg-signal-hover"
          >
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    );
  }

  if (placedOrder) {
    const statusMeta = getOrderStatusMeta(placedOrder.status);
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="border border-line-strong bg-surface p-8">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-7 w-7 text-fit-flat" />
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
                ĐƠN HÀNG ĐÃ ĐƯỢC TẠO
              </div>
              <h1 className="font-display text-2xl font-extrabold text-ink tabular-telemetry">
                {placedOrder.orderNumber}
              </h1>
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-y border-line py-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-ink-muted">Trạng thái</div>
              <span
                className={`mt-1 inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${statusMeta.className}`}
              >
                {statusMeta.label}
              </span>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Cần thanh toán</div>
              <div className="mt-1 font-bold text-signal tabular-telemetry">
                {formatVnd(placedOrder.payableNowVnd)}
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Còn lại khi bàn giao</div>
              <div className="mt-1 font-bold text-ink tabular-telemetry">
                {formatVnd(placedOrder.remainingBalanceVnd)}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-4 border border-fit-unsafe/40 bg-red-50 px-3 py-2 text-xs text-fit-unsafe">
              {errorMsg}
            </div>
          )}

          {placedOrder.status === 'PENDING_PAYMENT' && (
            <div className="mt-5 space-y-3 border border-line bg-canvas p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-ink">
                Cổng thanh toán: {placedOrder.paymentMethod}
              </div>
              {paymentIntent?.qrCodeData && (
                <div className="break-all rounded-sm border border-line bg-surface p-2 text-xs text-ink-secondary tabular-telemetry">
                  VietQR Payload: {paymentIntent.qrCodeData}
                </div>
              )}
              {process.env.NODE_ENV !== 'production' && (
                <button
                  type="button"
                  disabled={completingMock}
                  onClick={handleCompleteMockPayment}
                  className="w-full rounded-sm bg-signal px-4 py-2.5 text-sm font-bold text-surface hover:bg-signal-hover disabled:opacity-50"
                >
                  {completingMock
                    ? 'Đang xử lý webhook thanh toán...'
                    : 'Giả lập hoàn tất thanh toán ngay (Local / Test)'}
                </button>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/account"
              className="rounded-sm bg-ink px-5 py-2.5 text-sm font-bold text-surface hover:bg-signal"
            >
              Theo dõi đơn hàng trong Tài khoản
            </Link>
            <Link
              href="/bikes"
              className="rounded-sm border border-line-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink hover:bg-canvas"
            >
              Tiếp tục xem xe
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6">
      <div className="mb-6 border-b border-line pb-4">
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          THANH TOÁN AN TOÀN · IDEMPOTENT CHECKOUT
        </div>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">
          Xác nhận thông tin đặt cọc & giao hàng
        </h1>
      </div>

      {(cart?.items?.length ?? 0) === 0 ? (
        <div className="border border-line bg-surface p-8 text-sm text-ink-secondary">
          Giỏ hàng đang trống.{' '}
          <Link href="/bikes" className="font-semibold text-signal underline">
            Chọn xe hoặc phụ kiện trước khi thanh toán.
          </Link>
        </div>
      ) : (
        <form onSubmit={handleCheckout} className="grid gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="border border-line bg-surface p-6">
              <h2 className="font-display text-lg font-bold text-ink">
                1. Địa chỉ nhận xe / phụ tùng
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-ink-secondary">Người nhận</label>
                  <input
                    required
                    value={address.recipientName}
                    onChange={(e) => setAddress({ ...address, recipientName: e.target.value })}
                    className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-secondary">
                    Số điện thoại
                  </label>
                  <input
                    required
                    placeholder="0901234567"
                    value={address.phone}
                    onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                    className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm tabular-telemetry"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-secondary">
                    Tỉnh / Thành phố
                  </label>
                  <input
                    required
                    value={address.province}
                    onChange={(e) => setAddress({ ...address, province: e.target.value })}
                    className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-secondary">
                    Quận / Huyện
                  </label>
                  <input
                    required
                    value={address.district}
                    onChange={(e) => setAddress({ ...address, district: e.target.value })}
                    className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-ink-secondary">
                    Địa chỉ chi tiết
                  </label>
                  <input
                    required
                    placeholder="Số nhà, tên đường, phường..."
                    value={address.streetAddress}
                    onChange={(e) => setAddress({ ...address, streetAddress: e.target.value })}
                    className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-ink-secondary">
                    Ghi chú kỹ thuật (tùy chọn)
                  </label>
                  <input
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Ví dụ: Cân chỉnh sẵn Sag cho người lái 65kg..."
                    className="mt-1 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="border border-line bg-surface p-6">
              <h2 className="font-display text-lg font-bold text-ink">
                2. Hình thức & Cổng thanh toán
              </h2>

              {hasBike && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setOrderType('BIKE_DEPOSIT')}
                    className={`border p-3 text-left ${
                      orderType === 'BIKE_DEPOSIT'
                        ? 'border-signal bg-orange-50'
                        : 'border-line bg-canvas'
                    }`}
                  >
                    <div className="text-sm font-bold text-ink">Đặt cọc giữ xe</div>
                    <div className="mt-1 text-xs text-ink-secondary tabular-telemetry">
                      Trả trước {formatVnd(cart.summary.depositPayableNowVnd)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('FULL_PURCHASE')}
                    className={`border p-3 text-left ${
                      orderType === 'FULL_PURCHASE'
                        ? 'border-signal bg-orange-50'
                        : 'border-line bg-canvas'
                    }`}
                  >
                    <div className="text-sm font-bold text-ink">Thanh toán 100%</div>
                    <div className="mt-1 text-xs text-ink-secondary tabular-telemetry">
                      Trả trọn {formatVnd(cart.summary.totalVnd)}
                    </div>
                  </button>
                </div>
              )}

              <div className="mt-4 space-y-2.5">
                <label className="flex cursor-pointer items-center justify-between border border-line bg-canvas p-3">
                  <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="MOCK"
                      checked={paymentMethod === 'MOCK'}
                      onChange={() => setPaymentMethod('MOCK')}
                      className="accent-signal"
                    />
                    <span>Mock Payment Gateway (Local / Test Sandbox)</span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-center justify-between border border-line bg-canvas p-3">
                  <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="PAYOS"
                      checked={paymentMethod === 'PAYOS'}
                      onChange={() => setPaymentMethod('PAYOS')}
                      className="accent-signal"
                    />
                    <span>PayOS VietQR (Chuyển khoản tức thời)</span>
                  </span>
                </label>

                <label
                  className={`flex items-center justify-between border p-3 ${
                    codAllowed
                      ? 'cursor-pointer border-line bg-canvas'
                      : 'cursor-not-allowed border-line bg-canvas/50 opacity-60'
                  }`}
                >
                  <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COD"
                      disabled={!codAllowed}
                      checked={paymentMethod === 'COD'}
                      onChange={() => setPaymentMethod('COD')}
                      className="accent-signal"
                    />
                    <span>Thanh toán khi nhận hàng (COD)</span>
                  </span>
                  {!codAllowed && (
                    <span className="text-[11px] font-medium text-fit-unsafe">
                      Cấm COD với đơn có xe máy / &gt;20tr ₫
                    </span>
                  )}
                </label>
              </div>
            </div>
          </div>

          <aside className="h-fit border border-line-strong bg-surface p-6 lg:col-span-5">
            <h2 className="font-display text-lg font-bold text-ink">Chi tiết thanh toán</h2>
            <dl className="mt-4 space-y-2 border-y border-line py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-secondary">Số lượng sản phẩm</dt>
                <dd className="tabular-telemetry">{cart.itemCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-secondary">Tổng đơn hàng</dt>
                <dd className="font-semibold tabular-telemetry">
                  {formatVnd(cart.summary.totalVnd)}
                </dd>
              </div>
              <div className="flex justify-between pt-2 text-base font-bold text-signal">
                <dt>Số tiền thanh toán ngay</dt>
                <dd className="tabular-telemetry">{formatVnd(payablePreview)}</dd>
              </div>
            </dl>

            <div className="mt-3 text-[11px] text-ink-muted tabular-telemetry">
              Idempotency-Key: {idempotencyKey}
            </div>

            {errorMsg && (
              <div className="mt-4 flex items-start gap-2 border border-fit-unsafe/40 bg-red-50 p-3 text-xs text-fit-unsafe">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-sm bg-signal px-5 py-3 text-sm font-bold text-surface hover:bg-signal-hover disabled:opacity-50"
            >
              {submitting ? 'Đang khóa tồn kho & tạo đơn...' : 'Xác nhận đặt đơn'}
            </button>
          </aside>
        </form>
      )}
    </div>
  );
}
