'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { LogOut, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { formatVnd, getOrderStatusMeta } from '@/lib/formatters';
import { useAuth, useRiderProfile } from '@/providers/AppProviders';

/**
 * Customer Account Hub: Body Profiles CRUD, Order Tracking & Cancellation, Test Ride Bookings.
 * @returns {import('react').JSX.Element}
 */
export default function AccountPage() {
  const { user, authReady, logout, refreshUser } = useAuth();
  const { setRiderProfile } = useRiderProfile();

  const [profiles, setProfiles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [label, setLabel] = useState('Hồ sơ Trail cá nhân');
  const [heightCm, setHeightCm] = useState(168);
  const [weightKg, setWeightKg] = useState(65);
  const [footwear, setFootwear] = useState('MX_BOOTS');
  const [statusMessage, setStatusMessage] = useState('');

  const loadAccountData = useCallback(async () => {
    if (!user) return;
    const [profRes, ordRes, trRes] = await Promise.all([
      apiRequest('/api/v1/users/me/body-profiles'),
      apiRequest('/api/v1/orders'),
      apiRequest('/api/v1/test-rides/me'),
    ]);
    setProfiles(profRes?.profiles ?? []);
    setOrders(Array.isArray(ordRes) ? ordRes : []);
    setBookings(trRes?.bookings ?? []);
  }, [user]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    setStatusMessage('');
    await apiRequest('/api/v1/users/me/body-profiles', {
      method: 'POST',
      body: {
        label,
        heightCm: Number(heightCm),
        weightKg: Number(weightKg),
        footwear,
        isDefault: profiles.length === 0,
      },
    });
    await refreshUser();
    await loadAccountData();
    setStatusMessage('Đã lưu hồ sơ thể trạng mới.');
  };

  const handleDeleteProfile = async (id) => {
    await apiRequest(`/api/v1/users/me/body-profiles/${id}`, { method: 'DELETE' });
    await loadAccountData();
  };

  const handleCancelOrder = async (orderId) => {
    await apiRequest(`/api/v1/orders/${orderId}/cancel`, {
      method: 'POST',
      body: { reason: 'Khách hàng hủy từ trang Tài khoản' },
    });
    await loadAccountData();
  };

  const handleCancelBooking = async (bookingId) => {
    await apiRequest(`/api/v1/test-rides/${bookingId}/cancel`, {
      method: 'PATCH',
      body: {},
    });
    await loadAccountData();
  };

  if (!authReady) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-10 text-sm text-ink-secondary sm:px-6">
        Đang tải thông tin tài khoản...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center sm:px-6">
        <div className="border border-line-strong bg-surface p-8">
          <h1 className="font-display text-2xl font-bold text-ink">Chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Đăng nhập để quản lý hồ sơ thể trạng, đơn đặt cọc và lịch lái thử.
          </p>
          <Link
            href="/login?next=/account"
            className="mt-5 inline-block rounded-sm bg-signal px-6 py-2.5 text-sm font-bold text-surface"
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
            {user.role} · TÀI KHOẢN CÁ NHÂN
          </div>
          <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">{user.fullName}</h1>
          <p className="text-xs text-ink-secondary">{user.email}</p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-sm border border-line-strong bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-canvas"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Đăng xuất</span>
        </button>
      </div>

      <Tabs.Root defaultValue="profiles" className="border border-line bg-surface">
        <Tabs.List className="flex flex-wrap gap-6 border-b border-line px-6 text-sm font-medium">
          <Tabs.Trigger
            value="profiles"
            className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
          >
            Hồ sơ vóc dáng ({profiles.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="orders"
            className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
          >
            Đơn hàng & Đặt cọc ({orders.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="test-rides"
            className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
          >
            Lịch lái thử ({bookings.length})
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="profiles" className="grid gap-8 p-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            {profiles.length === 0 ? (
              <p className="text-sm text-ink-secondary">Chưa có hồ sơ thể trạng nào được lưu.</p>
            ) : (
              profiles.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border border-line bg-canvas p-4"
                >
                  <div>
                    <div className="font-semibold text-ink">
                      {p.label}{' '}
                      {p.isDefault && (
                        <span className="ml-2 rounded-sm bg-ink px-1.5 py-0.5 text-[10px] text-surface">
                          MẶC ĐỊNH
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-ink-secondary tabular-telemetry">
                      {p.heightCm} cm · {p.weightKg} kg · Inseam {p.inseamCm ?? '—'} cm ·{' '}
                      {p.footwear}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRiderProfile({
                          heightCm: p.heightCm,
                          weightKg: p.weightKg,
                          inseamCm: p.inseamCm ?? null,
                          footwear: p.footwear,
                        });
                        setStatusMessage(`Đã áp dụng hồ sơ "${p.label}" vào Simulator.`);
                      }}
                      className="rounded-sm border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink"
                    >
                      Dùng cho Simulator
                    </button>
                    <button
                      type="button"
                      aria-label="Xóa hồ sơ"
                      onClick={() => handleDeleteProfile(p.id)}
                      className="p-1.5 text-ink-muted hover:text-fit-unsafe"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
            {statusMessage && (
              <div className="text-xs font-medium text-fit-flat">{statusMessage}</div>
            )}
          </div>

          <form
            onSubmit={handleCreateProfile}
            className="space-y-3 border border-line bg-canvas p-5 lg:col-span-5"
          >
            <div className="text-sm font-bold text-ink">Thêm hồ sơ thể trạng mới</div>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Tên hồ sơ"
              className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-muted">Chiều cao (cm)</label>
                <input
                  type="number"
                  min={135}
                  max={220}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-1.5 text-sm tabular-telemetry"
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted">Cân nặng (kg)</label>
                <input
                  type="number"
                  min={35}
                  max={160}
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-1.5 text-sm tabular-telemetry"
                />
              </div>
            </div>
            <select
              value={footwear}
              onChange={(e) => setFootwear(e.target.value)}
              className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="MX_BOOTS">MX Boots</option>
              <option value="ADV_BOOTS">ADV Boots</option>
              <option value="SNEAKERS">Giày thường</option>
            </select>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-ink px-4 py-2 text-xs font-bold text-surface hover:bg-signal"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Lưu hồ sơ</span>
            </button>
          </form>
        </Tabs.Content>

        <Tabs.Content value="orders" className="space-y-4 p-6">
          {orders.length === 0 ? (
            <p className="text-sm text-ink-secondary">Bạn chưa có đơn hàng nào.</p>
          ) : (
            orders.map((order) => {
              const st = getOrderStatusMeta(order.status);
              return (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-4 border border-line bg-canvas p-4"
                >
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-ink tabular-telemetry">
                        {order.orderNumber}
                      </span>
                      <span
                        className={`rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${st.className}`}
                      >
                        {st.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-secondary tabular-telemetry">
                      Tổng: {formatVnd(order.totalVnd)} · Đã trả: {formatVnd(order.paidAmountVnd)} ·
                      Còn lại: {formatVnd(order.remainingBalanceVnd)}
                    </div>
                  </div>

                  {order.status === 'PENDING_PAYMENT' && (
                    <button
                      type="button"
                      onClick={() => handleCancelOrder(order.id)}
                      className="rounded-sm border border-fit-unsafe/50 bg-surface px-3 py-1.5 text-xs font-semibold text-fit-unsafe hover:bg-red-50"
                    >
                      Hủy đơn chờ thanh toán
                    </button>
                  )}
                </div>
              );
            })
          )}
        </Tabs.Content>

        <Tabs.Content value="test-rides" className="space-y-4 p-6">
          {bookings.length === 0 ? (
            <div className="text-sm text-ink-secondary">
              Chưa có lịch lái thử nào.{' '}
              <Link href="/test-ride" className="font-bold text-signal underline">
                Đặt lịch ngay
              </Link>
            </div>
          ) : (
            bookings.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-4 border border-line bg-canvas p-4"
              >
                <div>
                  <div className="font-bold text-ink">
                    {b.bike?.name} ·{' '}
                    <span className="text-xs font-normal text-ink-muted tabular-telemetry">
                      {b.bookingCode}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-ink-secondary tabular-telemetry">
                    {b.scheduledDate} ({b.timeSlot}) · Showroom {b.showroomCode} · Trạng thái:{' '}
                    <strong>{b.status}</strong>
                  </div>
                </div>

                {(b.status === 'PENDING' || b.status === 'CONFIRMED') && (
                  <button
                    type="button"
                    onClick={() => handleCancelBooking(b.id)}
                    className="rounded-sm border border-fit-unsafe/50 bg-surface px-3 py-1.5 text-xs font-semibold text-fit-unsafe hover:bg-red-50"
                  >
                    Hủy lịch
                  </button>
                )}
              </div>
            ))
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
