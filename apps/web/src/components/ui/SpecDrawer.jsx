'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { formatMm, formatVnd, getCategoryLabel, getRidingFocusLabel } from '@/lib/formatters';

/**
 * Slide-over technical specification drawer powered by Radix Dialog (Tier 3 Progressive Disclosure).
 * @param {object} props
 * @param {object} props.bike
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @returns {import('react').JSX.Element}
 */
export default function SpecDrawer({ bike, open, onOpenChange }) {
  const g = bike?.geometrySpec ?? {};

  const rows = [
    ['Phân khúc', getCategoryLabel(bike.category)],
    ['Mục tiêu vận hành', getRidingFocusLabel(bike.ridingFocus)],
    ['Động cơ', `${bike.engineCc} cc`],
    ['Lưu thông đường phố', bike.streetLegal ? 'Có đăng kiểm (Street Legal)' : 'Chuyên trường đua'],
    ['Chiều cao yên tĩnh', formatMm(g.unladenSeatHeightMm)],
    ['Độ rộng mặt yên', formatMm(g.seatWidthMm)],
    ['Chiều dài cơ sở (Wheelbase)', formatMm(g.wheelbaseMm)],
    ['Khoảng sáng gầm', formatMm(g.groundClearanceMm)],
    ['Hành trình phuộc trước', formatMm(g.frontTravelMm)],
    ['Hành trình phuộc sau', formatMm(g.rearTravelMm)],
    ['Static Sag trước / sau', `${g.staticSagFrontMm ?? '—'} / ${g.staticSagRearMm ?? '—'} mm`],
    ['Cỡ vành trước / sau', `${g.frontWheelDiameterIn ?? '—'}" / ${g.rearWheelDiameterIn ?? '—'}"`],
    ['Góc lái (Rake) / Trail', `${g.rakeDeg ?? '—'}° / ${g.trailMm ?? '—'} mm`],
    ['Trọng lượng ướt', `${g.wetWeightKg ?? '—'} kg`],
    ['Dung tích bình xăng', `${g.fuelCapacityL ?? '—'} L`],
    ['Giá niêm yết', formatVnd(bike.priceVnd)],
    ['Tiền cọc giữ xe', formatVnd(bike.depositAmountVnd)],
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line-strong bg-surface shadow-xl focus:outline-none">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <div>
              <Dialog.Title className="font-display text-lg font-bold text-ink">
                Bảng thông số kỹ thuật đầy đủ
              </Dialog.Title>
              <Dialog.Description className="text-xs text-ink-muted">
                {bike.name} · SKU {bike.sku}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Đóng bảng thông số"
              className="rounded-sm border border-line p-1.5 text-ink-secondary hover:border-line-strong hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <dl className="divide-y divide-line">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <dt className="text-ink-secondary">{label}</dt>
                  <dd className="text-right font-medium text-ink tabular-telemetry">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
