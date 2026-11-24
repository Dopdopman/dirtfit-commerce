'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { ApiError, apiRequest } from '@/lib/api-client';

const SHOWROOM_OPTIONS = [
  { value: '', label: 'Tất cả Showroom' },
  { value: 'HN_LONG_BIEN', label: 'Hà Nội — Long Biên' },
  { value: 'DN_SON_TRA', label: 'Đà Nẵng — Sơn Trà' },
  { value: 'HCM_THU_DUC', label: 'TP.HCM — Thủ Đức' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'PENDING', label: 'Chờ xác nhận (PENDING)' },
  { value: 'CONFIRMED', label: 'Đã xác nhận (CONFIRMED)' },
  { value: 'COMPLETED', label: 'Hoàn tất (COMPLETED)' },
  { value: 'CANCELLED', label: 'Đã hủy (CANCELLED)' },
  { value: 'NO_SHOW', label: 'Vắng mặt (NO_SHOW)' },
];

const STATUS_BADGE = {
  PENDING: 'border-warning-border bg-warning-soft text-warning',
  CONFIRMED: 'border-signal bg-signal-soft text-signal',
  COMPLETED: 'border-safe-border bg-safe-soft text-safe',
  CANCELLED: 'border-line bg-canvas text-ink-muted',
  NO_SHOW: 'border-danger-border bg-danger-soft text-danger',
};

/**
 * Admin & Sales Test Ride Bookings management page (`/admin/test-rides`).
 * Supports filtering across the 3 showrooms, date, and status transitions.
 * @returns {import('react').JSX.Element}
 */
export default function AdminTestRidesPage() {
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
      setError(
        err instanceof ApiError ? err.detail || err.message : 'Không thể tải danh sách lái thử.'
      );
    } finally {
      setLoading(false);
    }
  }, [showroomCode, statusFilter, dateFilter]);

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
      setFeedback(`Đã cập nhật trạng thái lịch lái thử sang ${nextStatus}.`);
      await loadBookings();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail || err.message : 'Không thể cập nhật lịch lái thử.'
      );
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Quản lý Lịch Lái thử</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Điều phối lịch tại 3 showroom (Long Biên, Sơn Trà, Thủ Đức) và xác nhận setup yên/phuộc.
          </p>
        </div>
        <button
          type="button"
          onClick={loadBookings}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-canvas"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Tải lại
        </button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-4">
        <label className="space-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-muted">Showroom</span>
          <select
            value={showroomCode}
            onChange={(e) => setShowroomCode(e.target.value)}
            className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
          >
            {SHOWROOM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-muted">Trạng thái</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-sm border border-line bg-canvas px-3 py-2 text-xs text-ink"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-muted">Ngày hẹn</span>
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
            Xóa bộ lọc
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
              <th className="px-4 py-3">Ngày & Khung giờ</th>
              <th className="px-4 py-3">Showroom</th>
              <th className="px-4 py-3">Mẫu xe</th>
              <th className="px-4 py-3">Khách hàng / Bằng lái</th>
              <th className="px-4 py-3">Thông số Fit Snapshot</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  {loading ? 'Đang tải dữ liệu...' : 'Không có lịch lái thử nào phù hợp bộ lọc.'}
                </td>
              </tr>
            ) : (
              bookings.map((ride) => {
                const profile = ride.riderProfileSnapshot;
                const badgeClass =
                  STATUS_BADGE[ride.status] || 'border-line bg-canvas text-ink-secondary';
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
                      {ride.showroomCode}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {ride.bike?.name || ride.bikeId}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">
                        {ride.user?.fullName || 'Khách hàng'}
                      </p>
                      <p className="font-mono text-[11px] text-ink-muted">
                        {ride.user?.phone || ride.user?.email} · Hạng {ride.licenseClass}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-secondary tabular-telemetry">
                      {profile
                        ? `${profile.heightCm}cm / ${profile.weightKg}kg${
                            profile.inseamCm ? ` / Inseam ${profile.inseamCm}cm` : ''
                          }`
                        : 'Không đính kèm'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold ${badgeClass}`}
                      >
                        {ride.status}
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
                            Xác nhận
                          </button>
                        )}
                        {canComplete && (
                          <button
                            type="button"
                            disabled={busyId === ride.id}
                            onClick={() => handleStatusUpdate(ride.id, 'COMPLETED')}
                            className="rounded-sm border border-safe-border bg-safe-soft px-2 py-1 text-[11px] font-semibold text-safe hover:opacity-90 disabled:opacity-50"
                          >
                            Hoàn tất
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
                              Vắng mặt
                            </button>
                            <button
                              type="button"
                              disabled={busyId === ride.id}
                              onClick={() => handleStatusUpdate(ride.id, 'CANCELLED')}
                              className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2 py-1 text-[11px] font-semibold text-danger hover:opacity-90 disabled:opacity-50"
                            >
                              <XCircle className="h-3 w-3" />
                              Hủy
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
