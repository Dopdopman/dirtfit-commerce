'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useRiderProfile } from '@/providers/AppProviders';

/**
 * Quick Rider-Fit entry bar on Homepage routing directly into filtered /bikes catalog.
 * @returns {import('react').JSX.Element}
 */
export default function QuickFitBar() {
  const router = useRouter();
  const { riderProfile, setRiderProfile } = useRiderProfile();

  const [heightCm, setHeightCm] = useState(riderProfile.heightCm ?? 168);
  const [weightKg, setWeightKg] = useState(riderProfile.weightKg ?? 65);
  const [ridingFocus, setRidingFocus] = useState('ALL');
  const [bootType, setBootType] = useState(riderProfile.footwear ?? 'MX_BOOTS');

  const handleSubmit = (e) => {
    e.preventDefault();
    const safeHeight = Math.min(220, Math.max(135, Number(heightCm) || 168));
    const safeWeight = Math.min(160, Math.max(35, Number(weightKg) || 65));

    setRiderProfile({
      heightCm: safeHeight,
      weightKg: safeWeight,
      footwear: bootType,
    });

    const params = new URLSearchParams({
      heightCm: String(safeHeight),
      weightKg: String(safeWeight),
      bootType,
      includeModdable: 'true',
    });
    if (ridingFocus !== 'ALL') {
      params.set('ridingFocus', ridingFocus);
    }
    router.push(`/bikes?${params.toString()}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 border border-line-strong bg-surface p-4 sm:grid-cols-12 sm:items-end"
    >
      <div className="sm:col-span-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Chiều cao (cm)
        </label>
        <input
          type="number"
          min={135}
          max={220}
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm font-semibold text-ink tabular-telemetry focus:border-line-strong focus:outline-none"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Cân nặng (kg)
        </label>
        <input
          type="number"
          min={35}
          max={160}
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm font-semibold text-ink tabular-telemetry focus:border-line-strong focus:outline-none"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Giày bảo hộ
        </label>
        <select
          value={bootType}
          onChange={(e) => setBootType(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-2.5 py-2 text-sm text-ink focus:border-line-strong focus:outline-none"
        >
          <option value="MX_BOOTS">MX Boots</option>
          <option value="ADV_BOOTS">ADV Boots</option>
          <option value="SNEAKERS">Giày thường</option>
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Địa hình
        </label>
        <select
          value={ridingFocus}
          onChange={(e) => setRidingFocus(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-2.5 py-2 text-sm text-ink focus:border-line-strong focus:outline-none"
        >
          <option value="ALL">Tất cả dòng xe</option>
          <option value="OFF_ROAD">Chuyên Off-Road</option>
          <option value="ON_OFF_MIXED">Dual-Sport Hỗn hợp</option>
          <option value="ON_ROAD_ADV">On-Road / Adventure</option>
        </select>
      </div>

      <div className="sm:col-span-3">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-signal px-4 py-2.5 text-sm font-bold text-surface transition-colors hover:bg-signal-hover"
        >
          <span>Tìm xe hợp vóc dáng</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
