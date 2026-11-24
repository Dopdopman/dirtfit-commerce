'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { SHOWROOM_CODES, TEST_RIDE_STATUSES } from '@dirtfit/shared';
import { apiRequest } from '@/lib/api-client';
import { getShowroomMeta, getTestRideStatusMeta } from '@/lib/formatters';
import { localizeApiError } from '@/lib/i18n/translate';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Admin & Sales Test Ride Bookings management page (`/admin/test-rides`).
 * Supports filtering across the 3 showrooms, date, and status transitions.
 * @returns {import('react').JSX.Element}
 */
export default function AdminTestRidesPage() {
  const { locale, t } = useI18n();
  const [bookings, setBookings] = useState([]);
  const [showroomCode, setShowroomCode] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ limit: '50' });
      if (showroomCode) qs.set('showroomCode', showroomCode);
      if (statusFilter) qs.set('status', statusFilter);
      if (dateFilter) qs.set('date', dateFilter);

      const res = await apiRequest(`/api/v1/admin/test-rides?${qs.toString()}`);
      setBookings(res.data ?? []);
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [showroomCode, statusFilter, dateFilter, locale]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleStatusUpdate = async (bookingId, nextStatus) => {
    setBusyId(bookingId);
    setError('');
    setFeedback('');
    try {
      await apiRequest(`/api/v1/admin/test-rides/${bookingId}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setFeedback(`${bookingId.slice(0, 8)} -> ${nextStatus}`);
      await loadBookings();
    } catch (err) {
      setError(localizeApiError(err, locale));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {t('adminTestRides.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">{t('adminTestRides.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={loadBookings}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-canvas"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('common.reload')}
        </button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-4">
        <label className="space-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-muted">
            {t('adminTestRides.filterShowroom')}
          </span>
          <select
            value={showroomCode}
            onChange={(e) => setShowroomCode(e.target.value)}
            className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
          >
            <option value="">{t('adminTestRides.allShowrooms')}</option>
            {Object.values(SHOWROOM_CODES).map((code) => (
              <option key={code} value={code}>
                {getShowroomMeta(code, locale).shortName}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-muted">
            {t('adminTestRides.filterStatus')}
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
          >
            <option value="">{t('adminTestRides.allStatuses')}</option>
            {Object.values(TEST_RIDE_STATUSES).map((st) => (
              <option key={st} value={st}>
                {getTestRideStatusMeta(st, locale).label} ({st})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-muted">
            {t('adminTestRides.filterDate')}
          </span>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full rounded-sm border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink"
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setShowroomCode('');
              setStatusFilter('');
              setDateFilter('');
            }}
            className="w-full rounded-sm border border-line-strong bg-canvas px-3 py-2 text-xs font-semibold text-ink hover:bg-surface"
          >
            {t('common.clearFilters')}
          </button>
        </div>
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

      {/* Table */}
      <div className="overflow-x-auto rounded-sm border border-line bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">{t('adminTestRides.colDateTime')}</th>
              <th className="px-4 py-3">{t('adminTestRides.colShowroom')}</th>
              <th className="px-4 py-3">{t('adminTestRides.colBike')}</th>
              <th className="px-4 py-3">{t('adminTestRides.colCustomer')}</th>
              <th className="px-4 py-3">{t('adminTestRides.colFitSnapshot')}</th>
              <th className="px-4 py-3">{t('adminTestRides.colStatus')}</th>
              <th className="px-4 py-3 text-right">{t('adminTestRides.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  {loading ? t('common.loading') : t('adminTestRides.empty')}
                </td>
              </tr>
            ) : (
              bookings.map((ride) => {
                const profile = ride.riderProfileSnapshot;
                const statusMeta = getTestRideStatusMeta(ride.status, locale);
                const canConfirm = ride.status === 'PENDING';
                const canComplete = ride.status === 'PENDING' || ride.status === 'CONFIRMED';
                const canCancel = ride.status === 'PENDING' || ride.status === 'CONFIRMED';
                return (
                  <tr key={ride.id} className="hover:bg-canvas/50">
                    <td className="px-4 py-3 font-mono text-ink tabular-telemetry">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <CalendarClock className="h-3.5 w-3.5 text-signal" />
                        {String(ride.scheduledDate).slice(0, 10)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-muted">{ride.timeSlot}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-secondary">
                      {getShowroomMeta(ride.showroomCode, locale).shortName}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {ride.bike?.name || ride.bikeId}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{ride.user?.fullName || '—'}</p>
                      <p className="font-mono text-[11px] text-ink-muted">
                        {ride.user?.phone || ride.user?.email} · {ride.licenseClass}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-secondary tabular-telemetry">
                      {profile
                        ? `${profile.heightCm}cm / ${profile.weightKg}kg${
                            profile.inseamCm ? ` / Inseam ${profile.inseamCm}cm` : ''
                          }`
                        : t('adminTestRides.noSnapshot')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold ${statusMeta.toneClass}`}
                      >
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        {canConfirm && (
                          <button
                            type="button"
                            disabled={busyId === ride.id}
                            onClick={() => handleStatusUpdate(ride.id, 'CONFIRMED')}
                            className="inline-flex items-center gap-1 rounded-sm border border-signal bg-signal-soft px-2 py-1 text-[11px] font-semibold text-signal hover:bg-signal hover:text-surface disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {t('adminTestRides.confirmBtn')}
                          </button>
                        )}
                        {canComplete && (
                          <button
                            type="button"
                            disabled={busyId === ride.id}
                            onClick={() => handleStatusUpdate(ride.id, 'COMPLETED')}
                            className="rounded-sm border border-safe-border bg-safe-soft px-2 py-1 text-[11px] font-semibold text-safe hover:opacity-90 disabled:opacity-50"
                          >
                            {t('adminTestRides.completeBtn')}
                          </button>
                        )}
                        {canCancel && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === ride.id}
                              onClick={() => handleStatusUpdate(ride.id, 'NO_SHOW')}
                              className="rounded-sm border border-warning-border bg-warning-soft px-2 py-1 text-[11px] font-semibold text-warning hover:opacity-90 disabled:opacity-50"
                            >
                              {t('adminTestRides.noShowBtn')}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === ride.id}
                              onClick={() => handleStatusUpdate(ride.id, 'CANCELLED')}
                              className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2 py-1 text-[11px] font-semibold text-danger hover:opacity-90 disabled:opacity-50"
                            >
                              <XCircle className="h-3 w-3" />
                              {t('adminTestRides.cancelBtn')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
