'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Eye, RefreshCw, X } from 'lucide-react';
import { ORDER_STATUSES } from '@dirtfit/shared';
import { getAllowedNextOrderStatuses } from '@/lib/admin-helpers';
import { apiRequest } from '@/lib/api-client';
import { formatDateTime, formatVnd, getOrderStatusMeta } from '@/lib/formatters';
import { localizeApiError } from '@/lib/i18n/translate';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Admin & Sales Order Lifecycle Management (`/admin/orders`).
 * Enforces state-machine transitions via `ALLOWED_ORDER_TRANSITIONS` and inspects payments in a Radix drawer.
 * @returns {import('react').JSX.Element}
 */
export default function AdminOrdersPage() {
  const { locale, t } = useI18n();
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
      setError(localizeApiError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, orderNumberFilter, locale]);

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
      setFeedback(`${updated?.orderNumber || ''} -> ${nextStatus}`);
      setInternalNote('');
      if (updated) {
        setSelectedOrder(updated);
      }
      await loadOrders();
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setBusyTransition(false);
    }
  };

  const nextStatuses = selectedOrder ? getAllowedNextOrderStatuses(selectedOrder.status) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{t('adminOrders.title')}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{t('adminOrders.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={loadOrders}
          className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-canvas"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-3">
        <input
          type="search"
          value={orderNumberFilter}
          onChange={(e) => setOrderNumberFilter(e.target.value)}
          placeholder={t('adminOrders.searchPlaceholder')}
          className="rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
        >
          <option value="">{t('adminOrders.allStatuses')}</option>
          {Object.values(ORDER_STATUSES).map((st) => (
            <option key={st} value={st}>
              {getOrderStatusMeta(st, locale).label} ({st})
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
          {t('common.clearFilters')}
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
              <th className="px-4 py-3">{t('adminOrders.colOrder')}</th>
              <th className="px-4 py-3">{t('adminOrders.colCustomer')}</th>
              <th className="px-4 py-3">{t('adminOrders.colMethod')}</th>
              <th className="px-4 py-3 text-right">{t('adminOrders.colAmount')}</th>
              <th className="px-4 py-3">{t('adminOrders.colStatus')}</th>
              <th className="px-4 py-3">{t('adminOrders.colCreated')}</th>
              <th className="px-4 py-3 text-right">{t('adminOrders.colDetail')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  {loading ? t('common.loading') : t('adminOrders.empty')}
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const statusMeta = getOrderStatusMeta(order.status, locale);
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
                      <p className="font-bold text-ink">{formatVnd(order.totalVnd, locale)}</p>
                      <p className="text-[11px] text-ink-muted">
                        {formatVnd(order.depositDueVnd, locale)}
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
                      {formatDateTime(order.createdAt, locale)}
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
                        {t('adminOrders.processBtn')}
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
                  {t('adminOrders.drawerOrderTitle', {
                    orderNumber: selectedOrder?.orderNumber || '',
                  })}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-ink-secondary">
                  {t('adminOrders.drawerCurrentStatus', {
                    status: selectedOrder?.status || '',
                  })}
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
                <section className="space-y-2">
                  <h3 className="font-mono text-[11px] font-bold uppercase text-ink-muted">
                    {t('adminOrders.itemsHeading', { count: selectedOrder.items?.length ?? 0 })}
                  </h3>
                  <div className="divide-y divide-line rounded-sm border border-line bg-canvas">
                    {(selectedOrder.items ?? []).map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2.5">
                        <div>
                          <p className="font-semibold text-ink">{item.itemNameSnapshot}</p>
                          <p className="font-mono text-[11px] text-ink-muted">
                            {item.itemType} · x{item.quantity}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-ink tabular-telemetry">
                          {formatVnd(item.lineTotalVnd, locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="font-mono text-[11px] font-bold uppercase text-ink-muted">
                    {t('adminOrders.paymentsHeading', {
                      count: selectedOrder.payments?.length ?? 0,
                    })}
                  </h3>
                  {(selectedOrder.payments ?? []).length === 0 ? (
                    <p className="rounded-sm border border-line bg-canvas px-3 py-2 text-ink-muted">
                      {t('adminOrders.noPayments')}
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
                            {formatVnd(tx.amountVnd, locale)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3 rounded-sm border border-line bg-canvas p-4">
                  <h3 className="font-mono text-[11px] font-bold uppercase text-ink">
                    {t('adminOrders.transitionHeading')}
                  </h3>
                  {nextStatuses.length === 0 ? (
                    <p className="text-ink-muted">
                      {t('adminOrders.terminalOrderNote', { status: selectedOrder.status })}
                    </p>
                  ) : (
                    <>
                      <textarea
                        rows={2}
                        value={internalNote}
                        onChange={(e) => setInternalNote(e.target.value)}
                        placeholder={t('adminOrders.internalNotePlaceholder')}
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
