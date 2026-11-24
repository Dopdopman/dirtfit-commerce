'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Bike, CalendarClock, Package, RefreshCw } from 'lucide-react';
import { computeDashboardMetrics } from '@/lib/admin-helpers';
import { apiRequest } from '@/lib/api-client';
import {
  formatVnd,
  getOrderStatusMeta,
  getShowroomMeta,
  getTestRideStatusMeta,
} from '@/lib/formatters';
import { localizeApiError } from '@/lib/i18n/translate';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Admin & Sales Operational Dashboard (`/admin`).
 * Displays live operational KPIs and actionable queues without decorative charts.
 * @returns {import('react').JSX.Element}
 */
export default function AdminDashboardPage() {
  const { locale, t } = useI18n();
  const [bikes, setBikes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [testRides, setTestRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bikesRes, ordersRes, ridesRes] = await Promise.all([
        apiRequest('/api/v1/admin/bikes?limit=50'),
        apiRequest('/api/v1/admin/orders?limit=50'),
        apiRequest('/api/v1/admin/test-rides?limit=50'),
      ]);
      setBikes(bikesRes.data ?? []);
      setOrders(ordersRes.data ?? []);
      setTestRides(ridesRes.data ?? []);
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const metrics = useMemo(
    () => computeDashboardMetrics({ bikes, orders, testRides }),
    [bikes, orders, testRides]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {t('adminDashboard.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">{t('adminDashboard.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={loadDashboard}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('adminDashboard.refreshBtn')}
        </button>
      </div>

      {error && (
        <div className="rounded-sm border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Operational KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-sm border border-line bg-surface p-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <span>{t('adminDashboard.kpiActiveOrders')}</span>
            <Package className="h-4 w-4 text-signal" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-ink tabular-telemetry">
            {metrics.pendingOrdersCount}
          </p>
          <p className="mt-1 text-xs text-ink-secondary">
            {t('adminDashboard.kpiActiveOrdersHint')}
          </p>
        </div>

        <div className="rounded-sm border border-line bg-surface p-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <span>{t('adminDashboard.kpiOpenRevenue')}</span>
            <Package className="h-4 w-4 text-ink-secondary" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-ink tabular-telemetry">
            {formatVnd(metrics.pendingOrdersRevenueVnd, locale)}
          </p>
          <p className="mt-1 text-xs text-ink-secondary">
            {t('adminDashboard.kpiOpenRevenueHint')}
          </p>
        </div>

        <div className="rounded-sm border border-line bg-surface p-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <span>{t('adminDashboard.kpiAvailableBikes')}</span>
            <Bike className="h-4 w-4 text-ink-secondary" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-ink tabular-telemetry">
            {metrics.totalAvailableBikes}
          </p>
          <p className="mt-1 text-xs text-ink-secondary">
            <span className="font-mono font-semibold text-warning">
              {metrics.lowStockBikesCount}
            </span>{' '}
            {t('adminDashboard.kpiLowStockPrefix')}
          </p>
        </div>

        <div className="rounded-sm border border-line bg-surface p-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <span>{t('adminDashboard.kpiUpcomingRides')}</span>
            <CalendarClock className="h-4 w-4 text-signal" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-ink tabular-telemetry">
            {metrics.upcomingTestRidesCount}
          </p>
          <p className="mt-1 text-xs text-ink-secondary">
            {t('adminDashboard.kpiUpcomingRidesHint')}
          </p>
        </div>
      </div>

      {/* Actionable Queues Grid */}
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-sm border border-line bg-surface xl:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
              {t('adminDashboard.ordersQueueTitle')}
            </h2>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 text-xs font-semibold text-signal hover:underline"
            >
              {t('adminDashboard.viewAll')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">{t('adminDashboard.colOrderNumber')}</th>
                  <th className="px-4 py-2.5">{t('adminDashboard.colCustomer')}</th>
                  <th className="px-4 py-2.5">{t('adminDashboard.colType')}</th>
                  <th className="px-4 py-2.5 text-right">{t('adminDashboard.colTotal')}</th>
                  <th className="px-4 py-2.5">{t('adminDashboard.colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {metrics.actionableOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                      {loading ? t('common.loading') : t('adminDashboard.noOrders')}
                    </td>
                  </tr>
                ) : (
                  metrics.actionableOrders.map((order) => {
                    const statusMeta = getOrderStatusMeta(order.status, locale);
                    return (
                      <tr key={order.id} className="hover:bg-canvas/60">
                        <td className="px-4 py-2.5 font-mono font-semibold text-ink">
                          {order.orderNumber}
                        </td>
                        <td className="px-4 py-2.5 text-ink-secondary">
                          {order.user?.fullName || order.shippingAddress?.recipientName || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-ink-muted">{order.orderType}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink tabular-telemetry">
                          {formatVnd(order.totalVnd, locale)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-block rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold ${statusMeta.toneClass}`}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Low Stock Alert Queue */}
        <section className="rounded-sm border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-ink">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {t('adminDashboard.lowStockTitle')}
            </h2>
            <Link
              href="/admin/bikes"
              className="inline-flex items-center gap-1 text-xs font-semibold text-signal hover:underline"
            >
              {t('adminDashboard.openInventory')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-line">
            {metrics.lowStockBikes.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-muted">
                {loading ? t('common.loading') : t('adminDashboard.allStockHealthy')}
              </p>
            ) : (
              metrics.lowStockBikes.map((bike) => (
                <Link
                  key={bike.id}
                  href={`/admin/bikes/${bike.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-canvas"
                >
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-xs font-semibold text-ink">{bike.name}</p>
                    <p className="font-mono text-[11px] text-ink-muted">{bike.sku}</p>
                  </div>
                  <div className="text-right font-mono">
                    <span className="rounded-sm border border-warning-border bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning tabular-telemetry">
                      {t('adminDashboard.remainingShort', {
                        count: bike.availableQty ?? bike.stockQty,
                      })}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Upcoming Test Rides */}
      <section className="rounded-sm border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
            {t('adminDashboard.upcomingRidesTitle')}
          </h2>
          <Link
            href="/admin/test-rides"
            className="inline-flex items-center gap-1 text-xs font-semibold text-signal hover:underline"
          >
            {t('adminDashboard.manageRides')} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-4 py-2.5">{t('adminDashboard.colDateTime')}</th>
                <th className="px-4 py-2.5">{t('adminDashboard.colShowroom')}</th>
                <th className="px-4 py-2.5">{t('adminDashboard.colBike')}</th>
                <th className="px-4 py-2.5">{t('adminDashboard.colCustomer')}</th>
                <th className="px-4 py-2.5">{t('adminDashboard.colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {metrics.upcomingTestRides.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                    {loading ? t('common.loading') : t('adminDashboard.noRides')}
                  </td>
                </tr>
              ) : (
                metrics.upcomingTestRides.map((ride) => {
                  const rideStatus = getTestRideStatusMeta(ride.status, locale);
                  return (
                    <tr key={ride.id} className="hover:bg-canvas/60">
                      <td className="px-4 py-2.5 font-mono text-ink tabular-telemetry">
                        {String(ride.scheduledDate).slice(0, 10)} · {ride.timeSlot}
                      </td>
                      <td className="px-4 py-2.5 text-ink-secondary">
                        {getShowroomMeta(ride.showroomCode, locale).shortName}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {ride.bike?.name || ride.bikeId}
                      </td>
                      <td className="px-4 py-2.5 text-ink-secondary">
                        {ride.user?.fullName || ride.user?.email || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold ${rideStatus.toneClass}`}
                        >
                          {rideStatus.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
