'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { LogOut, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  formatVnd,
  getFootwearLabel,
  getOrderStatusMeta,
  getShowroomMeta,
  getTestRideStatusMeta,
} from '@/lib/formatters';
import { useAuth, useRiderProfile } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Customer Account Hub: Body Profiles CRUD, Order Tracking & Cancellation, Test Ride Bookings.
 * @returns {import('react').JSX.Element}
 */
export default function AccountPage() {
  const { user, authReady, logout, refreshUser } = useAuth();
  const { setRiderProfile } = useRiderProfile();
  const { locale, t } = useI18n();

  const [profiles, setProfiles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [label, setLabel] = useState('Trail MX Setup');
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
    setStatusMessage(t('common.save'));
  };

  const handleDeleteProfile = async (id) => {
    await apiRequest(`/api/v1/users/me/body-profiles/${id}`, { method: 'DELETE' });
    await loadAccountData();
  };

  const handleCancelOrder = async (orderId) => {
    await apiRequest(`/api/v1/orders/${orderId}/cancel`, {
      method: 'POST',
      body: { reason: 'Customer cancelled from Account Hub' },
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
        {t('common.loading')}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center sm:px-6">
        <div className="border border-line-strong bg-surface p-8">
          <h1 className="font-display text-2xl font-bold text-ink">
            {t('account.loginPromptTitle')}
          </h1>
          <Link
            href="/login?next=/account"
            className="mt-5 inline-block rounded-sm bg-signal px-6 py-2.5 text-sm font-bold text-surface"
          >
            {t('account.loginPromptBtn')}
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
            {user.role} · {t('account.kicker')}
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
          <span>{t('account.signOut')}</span>
        </button>
      </div>

      <Tabs.Root defaultValue="profiles" className="border border-line bg-surface">
        <Tabs.List className="flex flex-wrap gap-6 border-b border-line px-6 text-sm font-medium">
          <Tabs.Trigger
            value="profiles"
            className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
          >
            {t('account.tabProfile')} ({profiles.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="orders"
            className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
          >
            {t('account.tabOrders')} ({orders.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="test-rides"
            className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
          >
            {t('account.tabTestRides')} ({bookings.length})
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="profiles" className="grid gap-8 p-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            {profiles.length === 0 ? (
              <p className="text-sm text-ink-secondary">{t('account.noProfiles')}</p>
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
                          {t('common.defaultLabel')}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-ink-secondary tabular-telemetry">
                      {p.heightCm} cm · {p.weightKg} kg · Inseam {p.inseamCm ?? '—'} cm ·{' '}
                      {getFootwearLabel(p.footwear, locale)}
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
                        setStatusMessage(`${p.label} -> Simulator`);
                      }}
                      className="rounded-sm border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink"
                    >
                      {t('account.applyToSimBtn')}
                    </button>
                    <button
                      type="button"
                      aria-label={t('account.deleteProfileBtn')}
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
            <div className="text-sm font-bold text-ink">{t('account.newProfileTitle')}</div>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('account.profileNameLabel')}
              className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-muted">{t('account.heightCm')}</label>
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
                <label className="text-xs text-ink-muted">{t('account.weightKg')}</label>
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
              <option value="MX_BOOTS">{getFootwearLabel('MX_BOOTS', locale)}</option>
              <option value="ADV_BOOTS">{getFootwearLabel('ADV_BOOTS', locale)}</option>
              <option value="SNEAKERS">{getFootwearLabel('SNEAKERS', locale)}</option>
            </select>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-ink px-4 py-2 text-xs font-bold text-surface hover:bg-signal"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('account.saveProfileBtn')}</span>
            </button>
          </form>
        </Tabs.Content>

        <Tabs.Content value="orders" className="space-y-4 p-6">
          {orders.length === 0 ? (
            <p className="text-sm text-ink-secondary">{t('account.noOrders')}</p>
          ) : (
            orders.map((order) => {
              const st = getOrderStatusMeta(order.status, locale);
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
                      {t('checkout.totalOrderValue')}: {formatVnd(order.totalVnd, locale)} ·{' '}
                      {t('checkout.payableNow')}: {formatVnd(order.paidAmountVnd, locale)} ·{' '}
                      {t('checkout.remainingBalance')}:{' '}
                      {formatVnd(order.remainingBalanceVnd, locale)}
                    </div>
                  </div>

                  {order.status === 'PENDING_PAYMENT' && (
                    <button
                      type="button"
                      onClick={() => handleCancelOrder(order.id)}
                      className="rounded-sm border border-fit-unsafe/50 bg-surface px-3 py-1.5 text-xs font-semibold text-fit-unsafe hover:bg-red-50"
                    >
                      {t('account.cancelOrderBtn')}
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
              {t('account.noTestRides')}{' '}
              <Link href="/test-ride" className="font-bold text-signal underline">
                {t('nav.testRide')}
              </Link>
            </div>
          ) : (
            bookings.map((b) => {
              const rideStatus = getTestRideStatusMeta(b.status, locale);
              return (
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
                      {b.scheduledDate} ({b.timeSlot}) ·{' '}
                      {getShowroomMeta(b.showroomCode, locale).shortName} ·{' '}
                      <strong>{rideStatus.label}</strong>
                    </div>
                  </div>

                  {(b.status === 'PENDING' || b.status === 'CONFIRMED') && (
                    <button
                      type="button"
                      onClick={() => handleCancelBooking(b.id)}
                      className="rounded-sm border border-fit-unsafe/50 bg-surface px-3 py-1.5 text-xs font-semibold text-fit-unsafe hover:bg-red-50"
                    >
                      {t('account.cancelRideBtn')}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
