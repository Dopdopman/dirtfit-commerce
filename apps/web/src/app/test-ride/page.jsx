'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Calendar, CheckCircle2 } from 'lucide-react';
import { SHOWROOMS, TEST_RIDE_TIME_SLOTS } from '@dirtfit/shared/enums';
import { apiRequest } from '@/lib/api-client';
import { getFootwearLabel, getShowroomMeta } from '@/lib/formatters';
import { localizeApiError } from '@/lib/i18n/translate';
import { useAuth, useRiderProfile } from '@/providers/AppProviders';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Inner Test Ride Booking form consuming query parameters cleanly inside Suspense.
 * @returns {import('react').JSX.Element}
 */
function TestRideContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { riderProfile } = useRiderProfile();
  const { locale, t } = useI18n();

  const [bikes, setBikes] = useState([]);
  const [bikeId, setBikeId] = useState(searchParams.get('bikeId') ?? '');
  const [showroomCode, setShowroomCode] = useState(SHOWROOMS[2].code);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [slots, setSlots] = useState(
    TEST_RIDE_TIME_SLOTS.map((timeSlot) => ({ timeSlot, available: true }))
  );
  const [timeSlot, setTimeSlot] = useState(TEST_RIDE_TIME_SLOTS[0]);
  const [licenseClass, setLicenseClass] = useState('A2');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [booked, setBooked] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await apiRequest('/api/v1/bikes?limit=24');
        const arr = Array.isArray(list) ? list : [];
        setBikes(arr);
        if (!bikeId && arr[0]) {
          setBikeId(arr[0].id);
        }
      } catch {
        // Ignore transient network error
      }
    })();
  }, [bikeId]);

  const loadSlots = useCallback(async () => {
    if (!bikeId || !showroomCode || !scheduledDate) return;
    try {
      const qs = new URLSearchParams({ bikeId, showroomCode, date: scheduledDate });
      const data = await apiRequest(`/api/v1/test-rides/slots?${qs.toString()}`);
      if (Array.isArray(data?.slots)) {
        setSlots(data.slots);
        const firstFree = data.slots.find((s) => s.available);
        if (firstFree && !data.slots.find((s) => s.timeSlot === timeSlot && s.available)) {
          setTimeSlot(firstFree.timeSlot);
        }
      }
    } catch {
      // Ignore transient slot query failure
    }
  }, [bikeId, showroomCode, scheduledDate, timeSlot]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleBook = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!user) {
      setErrorMsg(t('testRide.authHintTitle'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest('/api/v1/test-rides', {
        method: 'POST',
        body: {
          bikeId,
          showroomCode,
          scheduledDate,
          timeSlot,
          licenseClass,
          riderProfileSnapshot: riderProfile,
          notes: notes.trim() || undefined,
        },
      });
      setBooked(res.booking);
      await loadSlots();
    } catch (err) {
      setErrorMsg(localizeApiError(err, locale));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 border-b border-line pb-4">
        <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          {t('testRide.kicker')}
        </div>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">
          {t('testRide.title')}
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">{t('testRide.subtitle')}</p>
        <p className="mt-2 rounded-sm border border-line bg-surface px-3 py-1.5 text-xs text-ink-secondary tabular-telemetry">
          {t('testRide.attachedFitBanner', {
            height: riderProfile.heightCm,
            weight: riderProfile.weightKg,
            footwear: getFootwearLabel(riderProfile.footwear, locale),
          })}
        </p>
      </div>

      {booked && (
        <div className="mb-6 border border-fit-flat/40 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 font-bold text-fit-flat">
            <CheckCircle2 className="h-5 w-5" />
            <span>
              {t('testRide.successTitle')}: {booked.bookingCode}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-secondary tabular-telemetry">
            {t('testRide.successBody', {
              showroom: getShowroomMeta(booked.showroomCode, locale).name,
              slot: booked.timeSlot,
              date: booked.scheduledDate,
            })}
          </p>
        </div>
      )}

      <form onSubmit={handleBook} className="space-y-6 border border-line bg-surface p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t('testRide.bikeLabel')}
            </label>
            <select
              value={bikeId}
              onChange={(e) => setBikeId(e.target.value)}
              className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
            >
              {bikes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.geometrySpec?.unladenSeatHeightMm}mm)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t('testRide.showroomLabel')}
            </label>
            <select
              value={showroomCode}
              onChange={(e) => setShowroomCode(e.target.value)}
              className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
            >
              {SHOWROOMS.map((s) => (
                <option key={s.code} value={s.code}>
                  {getShowroomMeta(s.code, locale).name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t('testRide.dateLabel')}
            </label>
            <input
              type="date"
              required
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm tabular-telemetry"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t('testRide.licenseLabel')}
            </label>
            <select
              value={licenseClass}
              onChange={(e) => setLicenseClass(e.target.value)}
              className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
            >
              <option value="A2">{t('testRide.licenseOptions.A2')}</option>
              <option value="A1">{t('testRide.licenseOptions.A1')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t('testRide.slotLabel')}
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {slots.map((slot) => (
              <button
                key={slot.timeSlot}
                type="button"
                disabled={!slot.available}
                onClick={() => setTimeSlot(slot.timeSlot)}
                className={`rounded-sm border px-3 py-2.5 text-xs font-semibold tabular-telemetry ${
                  !slot.available
                    ? 'cursor-not-allowed border-line bg-canvas text-ink-muted line-through opacity-50'
                    : timeSlot === slot.timeSlot
                      ? 'border-signal bg-signal text-surface'
                      : 'border-line bg-canvas text-ink hover:border-line-strong'
                }`}
              >
                {slot.timeSlot}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t('testRide.notesLabel')}
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm"
          />
        </div>

        {errorMsg && (
          <div className="border border-fit-unsafe/40 bg-red-50 px-3 py-2 text-xs text-fit-unsafe">
            {errorMsg}{' '}
            {!user && (
              <Link href="/login?next=/test-ride" className="font-bold underline">
                {t('testRide.authHintBtn')}
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !bikeId}
          className="inline-flex items-center gap-2 rounded-sm bg-signal px-6 py-3 text-sm font-bold text-surface hover:bg-signal-hover disabled:opacity-50"
        >
          <Calendar className="h-4 w-4" />
          <span>{submitting ? t('testRide.submitting') : t('testRide.submitBtn')}</span>
        </button>
      </form>
    </div>
  );
}

/**
 * Showroom Test Ride Page wrapped in Suspense for static/SSR safety.
 * @returns {import('react').JSX.Element}
 */
export default function TestRidePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-ink-secondary sm:px-6">
          Loading...
        </div>
      }
    >
      <TestRideContent />
    </Suspense>
  );
}
