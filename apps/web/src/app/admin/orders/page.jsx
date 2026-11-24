'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Eye, RefreshCw, X } from 'lucide-react';
import { ORDER_STATUSES } from '@dirtfit/shared';
import { getAllowedNextOrderStatuses } from '@/lib/admin-helpers';
import { ApiError, apiRequest } from '@/lib/api-client';
import { formatVnd, getOrderStatusMeta } from '@/lib/formatters';

/**
 * Admin & Sales Order Lifecycle Management (`/admin/orders`).
 * Enforces state-machine transitions via `ALLOWED_ORDER_TRANSITIONS` and inspects payments in a Radix drawer.
 * @returns {import('react').JSX.Element}
 */
export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [orderNumberFilter, setOrderNumberFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [internalNote, setInternalNote] = useState('');
  const [busyTransition, setBusyTransition] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ limit: '50' });
      if (statusFilter) qs.set('status', statusFilter);
      if (orderNumberFilter.trim()) qs.set('orderNumber', orderNumberFilter.trim());

      const res = await apiRequest(`/api/v1/admin/orders?${qs.toString()}`);
      const loaded = res.data ?? [];
      setOrders(loaded);
      setSelectedOrder((prev) =>
        prev ? (loaded.find((item) => item.id === prev.id) ?? prev) : null
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail || err.message : 'Không thể tải danh sách đơn hàng.'
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, orderNumberFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleTransition = async (orderId, nextStatus) => {
    setBusyTransition(true);
    setError('');
    setFeedback('');
    try {
      const res = await apiRequest(`/api/v1/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: {
          status: nextStatus,
          ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
        },
      });
      const updated = res.data?.order;
      setFeedback(`Đã chuyển đơn hàng sang trạng thái ${nextStatus}.`);
      setInternalNote('');
      if (updated) {
        setSelectedOrder(updated);
      }
      await loadOrders();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `[${err.code}] ${err.detail || err.message}`
          : 'Không thể cập nhật trạng thái đơn hàng.'
      );
    } finally {
      setBusyTransition(false);
    }
  };

  const nextStatuses = selectedOrder ? getAllowedNextOrderStatuses(selectedOrder.status) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Quản lý Đơn hàng</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Kiểm soát trạng thái đơn theo State Machine, đối soát thanh toán cọc và ghi chú nội bộ.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOrders}
          className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-canvas"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-3">
        <input
          type="search"
          value={orderNumberFilter}
          onChange={(e) => setOrderNumberFilter(e.target.value)}
          placeholder="Tìm theo mã đơn (DF-...)..."
          className="rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
        >
          <option value="">Tất cả trạng thái</option>
          {Object.values(ORDER_STATUSES).map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setOrderNumberFilter('');
            setStatusFilter('');
          }}
          className="rounded-sm border border-line-strong bg-canvas px-3 py-2 text-xs font-semibold text-ink hover:bg-surface"
        >
          Xóa bộ lọc
        </button>
      </div>

      {error && (
        <div className="rounded-sm border border-danger-border bg-danger-soft px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}
      {feedback && (
        <div className="rounded-sm border border-safe-border bg-safe-soft px-4 py-3 text-xs text-safe">
          {feedback}
        </div>
      )}

      {/* Orders Table */}
      <div className="overflow-x-auto rounded-sm border border-line bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Mã đơn</th>
              <th className="px-4 py-3">Khách hàng</th>
              <th className="px-4 py-3">Loại / Phương thức</th>
              <th className="px-4 py-3 text-right">Tổng / Cần thu</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Ngày tạo</th>
              <th className="px-4 py-3 text-right">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  {loading ? 'Đang tải...' : 'Không có đơn hàng phù hợp.'}
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const statusMeta = getOrderStatusMeta(order.status);
                return (
                  <tr key={order.id} className="hover:bg-canvas/50">
                    <td className="px-4 py-3 font-mono font-bold text-ink">{order.orderNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">
                        {order.shippingAddress?.recipientName || order.user?.fullName || '—'}
                      </p>
                      <p className="font-mono text-[11px] text-ink-muted">
                        {order.shippingAddress?.phone || order.user?.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-secondary">
                      {order.orderType} · {order.paymentMethod}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-telemetry">
                      <p className="font-bold text-ink">{formatVnd(order.totalVnd)}</p>
                      <p className="text-[11px] text-ink-muted">
                        Cọc: {formatVnd(order.depositDueVnd)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold ${statusMeta.toneClass}`}
                      >
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-muted tabular-telemetry">
                      {new Date(order.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrder(order);
                          setInternalNote('');
                        }}
                        className="inline-flex items-center gap-1 rounded-sm border border-line-strong bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-signal hover:text-signal"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Xử lý
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Radix Order Detail Drawer */}
      <Dialog.Root
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
          <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <Dialog.Title className="font-mono text-base font-bold text-ink">
                  Đơn hàng {selectedOrder?.orderNumber}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-ink-secondary">
                  Trạng thái hiện tại:{' '}
                  <strong className="font-mono text-ink">{selectedOrder?.status}</strong>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="rounded-sm border border-line p-1.5 text-ink">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {selectedOrder && (
              <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
                {/* Items */}
                <section className="space-y-2">
                  <h3 className="font-mono text-[11px] font-bold uppercase text-ink-muted">
                    Sản phẩm trong đơn ({selectedOrder.items?.length ?? 0})
                  </h3>
                  <div className="divide-y divide-line rounded-sm border border-line bg-canvas">
                    {(selectedOrder.items ?? []).map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2.5">
                        <div>
                          <p className="font-semibold text-ink">{item.itemNameSnapshot}</p>
                          <p className="font-mono text-[11px] text-ink-muted">
                            {item.itemType} · SL: {item.quantity}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-ink tabular-telemetry">
                          {formatVnd(item.lineTotalVnd)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Payment History */}
                <section className="space-y-2">
                  <h3 className="font-mono text-[11px] font-bold uppercase text-ink-muted">
                    Lịch sử Thanh toán ({selectedOrder.payments?.length ?? 0})
                  </h3>
                  {(selectedOrder.payments ?? []).length === 0 ? (
                    <p className="rounded-sm border border-line bg-canvas px-3 py-2 text-ink-muted">
                      Chưa phát sinh giao dịch thanh toán.
                    </p>
                  ) : (
                    <div className="divide-y divide-line rounded-sm border border-line bg-canvas">
                      {selectedOrder.payments.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between px-3 py-2 font-mono"
                        >
                          <div>
                            <p className="font-semibold text-ink">
                              {tx.provider} · {tx.status}
                            </p>
                            <p className="text-[10px] text-ink-muted">
                              Ref: {tx.providerTxId || tx.id}
                            </p>
                          </div>
                          <span className="font-bold text-ink tabular-telemetry">
                            {formatVnd(tx.amountVnd)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* State Machine Transition Box */}
                <section className="rounded-sm border border-line bg-canvas p-4 space-y-3">
                  <h3 className="font-mono text-[11px] font-bold uppercase text-ink">
                    Chuyển trạng thái hợp lệ (State Machine)
                  </h3>
                  {nextStatuses.length === 0 ? (
                    <p className="text-ink-muted">
                      Đơn hàng đang ở trạng thái kết thúc ({selectedOrder.status}), không còn bước
                      chuyển tiếp.
                    </p>
                  ) : (
                    <>
                      <textarea
                        rows={2}
                        value={internalNote}
                        onChange={(e) => setInternalNote(e.target.value)}
                        placeholder="Ghi chú nội bộ khi chuyển trạng thái (tùy chọn)..."
                        className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-xs text-ink"
                      />
                      <div className="flex flex-wrap gap-2">
                        {nextStatuses.map((nextSt) => (
                          <button
                            key={nextSt}
                            type="button"
                            disabled={busyTransition}
                            onClick={() => handleTransition(selectedOrder.id, nextSt)}
                            className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                              nextSt === 'CANCELLED' || nextSt === 'REFUNDED'
                                ? 'border-danger-border bg-danger-soft text-danger hover:opacity-90'
                                : 'border-signal bg-signal-soft text-signal hover:bg-signal hover:text-surface'
                            }`}
                          >
                            <ArrowRight className="h-3 w-3" />
                            {nextSt}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
