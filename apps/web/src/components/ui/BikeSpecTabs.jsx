'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { formatMm, formatVnd, getCategoryLabel, getRidingFocusLabel } from '@/lib/formatters';

/**
 * Tier-3 Progressive Disclosure technical specification tabs powered by Radix Tabs.
 * @param {object} props
 * @param {object} props.bike
 * @param {() => void} props.onOpenDrawer
 * @param {(accessoryId: string) => void} props.onAddAccessory
 * @returns {import('react').JSX.Element}
 */
export default function BikeSpecTabs({ bike, onOpenDrawer, onAddAccessory }) {
  const g = bike.geometrySpec ?? {};
  const compatibilities = bike.compatibilities ?? [];

  return (
    <section className="mt-12 border border-line bg-surface">
      <Tabs.Root defaultValue="geometry">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 sm:px-6">
          <Tabs.List
            aria-label="Chi tiết thông số kỹ thuật"
            className="flex flex-wrap gap-6 text-sm font-medium"
          >
            <Tabs.Trigger
              value="geometry"
              className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
            >
              Hình học & Phuộc
            </Tabs.Trigger>
            <Tabs.Trigger
              value="engine"
              className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
            >
              Động cơ & Khung sườn
            </Tabs.Trigger>
            <Tabs.Trigger
              value="parts"
              className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
            >
              Phụ kiện tương thích ({compatibilities.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="policy"
              className="border-b-2 border-transparent py-3.5 text-ink-secondary data-[state=active]:border-signal data-[state=active]:text-ink"
            >
              Chính sách Đặt cọc
            </Tabs.Trigger>
          </Tabs.List>

          <button
            type="button"
            onClick={onOpenDrawer}
            className="my-2 rounded-sm border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-canvas"
          >
            Mở Spec Sheet đầy đủ
          </button>
        </div>

        <Tabs.Content value="geometry" className="grid gap-6 p-6 sm:grid-cols-3">
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">Chiều cao yên tĩnh / Độ rộng</div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {formatMm(g.unladenSeatHeightMm)} / {formatMm(g.seatWidthMm)}
            </div>
          </div>
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">Hành trình phuộc trước / sau</div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {formatMm(g.frontTravelMm)} / {formatMm(g.rearTravelMm)}
            </div>
          </div>
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">Wheelbase / Khoảng sáng gầm</div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {formatMm(g.wheelbaseMm)} / {formatMm(g.groundClearanceMm)}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="engine" className="grid gap-6 p-6 sm:grid-cols-3">
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">Dung tích xi-lanh</div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {bike.engineCc} cc
            </div>
            <div className="mt-1 text-xs text-ink-secondary">{getCategoryLabel(bike.category)}</div>
          </div>
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">Trọng lượng ướt & Bình xăng</div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {g.wetWeightKg} kg · {g.fuelCapacityL ?? '—'} L
            </div>
            <div className="mt-1 text-xs text-ink-secondary">
              {getRidingFocusLabel(bike.ridingFocus)}
            </div>
          </div>
          <div className="border border-line bg-canvas p-4">
            <div className="text-xs text-ink-muted">Tỉ số Sag chuẩn & Độ cứng yên</div>
            <div className="mt-1 text-lg font-bold text-ink tabular-telemetry">
              {Math.round((g.targetRiderSagRatio ?? 0.33) * 100)}% · {g.seatFoamFirmness}
            </div>
            <div className="mt-1 text-xs text-ink-secondary">
              Góc lái {g.rakeDeg ?? '—'}° · Trail {g.trailMm ?? '—'} mm
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="parts" className="p-6">
          {compatibilities.length === 0 ? (
            <p className="text-sm text-ink-secondary">
              Chưa có phụ kiện gắn trực tiếp cho mẫu này.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {compatibilities.map((comp) => (
                <div
                  key={comp.id}
                  className="flex flex-col justify-between gap-3 border border-line bg-canvas p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="font-semibold text-ink">{comp.accessory?.name}</div>
                    <div className="mt-1 text-xs text-ink-secondary">
                      {comp.fitmentNotes || 'Tương thích chuẩn ngàm zin theo xe'}
                    </div>
                    <div className="mt-1.5 text-xs font-medium text-ink tabular-telemetry">
                      Giá: {formatVnd(comp.accessory?.priceVnd ?? 0)}
                      {comp.installLaborVnd > 0 &&
                        ` (+${formatVnd(comp.installLaborVnd)} công lắp)`}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={(comp.availableQty ?? 0) <= 0}
                    onClick={() => onAddAccessory(comp.accessoryId)}
                    className="shrink-0 rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink hover:text-surface disabled:opacity-40"
                  >
                    {(comp.availableQty ?? 0) > 0 ? 'Thêm vào giỏ' : 'Tạm hết'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="policy" className="space-y-2 p-6 text-sm text-ink-secondary">
          <p>
            • Đặt cọc giữ khung xe trực tuyến ({formatVnd(bike.depositAmountVnd)}) qua VietQR PayOS
            giữ chỗ tồn kho độc quyền trong 15 phút khi thanh toán.
          </p>
          <p>
            • Xe máy không áp dụng COD; phần chênh lệch còn lại thanh toán khi nhận xe tại 3
            showroom Hà Nội, Đà Nẵng hoặc TP.HCM kèm dịch vụ cân chỉnh Rider Sag miễn phí.
          </p>
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}
