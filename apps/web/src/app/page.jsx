import Link from 'next/link';
import { ArrowRight, Compass, Layers, SlidersHorizontal } from 'lucide-react';
import QuickFitBar from '@/components/home/QuickFitBar';
import BikeCard from '@/components/ui/BikeCard';
import { fetchServerApi } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

const TERRAIN_LANES = [
  {
    focus: 'OFF_ROAD',
    tag: 'PURE OFF-ROAD',
    title: 'Motocross & Enduro',
    summary: 'Hành trình phuộc 300mm+, khung nhẹ dưới 115kg cho địa hình rừng núi kỹ thuật.',
  },
  {
    focus: 'ON_OFF_MIXED',
    tag: 'DUAL-SPORT',
    title: 'Phố & Đường mòn',
    summary:
      'Xe có đăng kiểm hợp pháp, mô-men xoắn linh hoạt chạy phố hằng ngày lẫn trail cuối tuần.',
  },
  {
    focus: 'ON_ROAD_ADV',
    tag: 'ADVENTURE / TOURING',
    title: 'Đường trường xuyên Việt',
    summary: 'Độ ổn định tốc độ cao, bình xăng lớn và công thái học ngồi thoải mái đường dài.',
  },
];

/**
 * Editorial Industrial Motorsport Homepage with Quick Rider-Fit entry bar and terrain lanes.
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function HomePage() {
  const bikesRes = await fetchServerApi('/api/v1/bikes?limit=6', { revalidate: 60 });
  const featuredBikes = bikesRes?.data ?? [];

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 sm:py-14">
      {/* Minimal Editorial Hero + Single Primary Entry Action */}
      <section className="border-b border-line pb-12">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 border border-line bg-surface px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-ink-secondary">
            <span className="h-2 w-2 bg-signal" />
            <span>INDUSTRIAL MOTORSPORT · 2D RIDER FIT ENGINE</span>
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Chọn đúng chiếc xe địa hình hợp vóc dáng của bạn ngay từ milimét đầu tiên.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-secondary">
            Nhập chiều cao và cân nặng để mô phỏng độ lún phuộc (Rider Sag), độ rộng mặt yên và mức
            độ chống chân thực tế trước khi đặt cọc hoặc lái thử tại showroom.
          </p>
        </div>

        <div className="mt-8">
          <QuickFitBar />
        </div>
      </section>

      {/* 3 Terrain Lanes */}
      <section className="mt-12 grid gap-4 md:grid-cols-3">
        {TERRAIN_LANES.map((lane) => (
          <Link
            key={lane.focus}
            href={`/bikes?ridingFocus=${lane.focus}`}
            className="group flex flex-col justify-between border border-line bg-surface p-6 transition-colors hover:border-line-strong"
          >
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-signal">
                {lane.tag}
              </div>
              <h2 className="mt-2 font-display text-xl font-bold text-ink">{lane.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{lane.summary}</p>
            </div>
            <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink group-hover:text-signal">
              <span>Xem dòng xe</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </Link>
        ))}
      </section>

      {/* Featured Motorcycles */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
              DANH MỤC NỔI BẬT
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold text-ink">
              Mẫu xe sẵn kho tại showroom
            </h2>
          </div>
          <Link
            href="/bikes"
            className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink hover:bg-ink hover:text-surface"
          >
            <span>Toàn bộ danh mục</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {featuredBikes.length === 0 ? (
          <div className="mt-6 border border-line bg-surface p-8 text-center text-sm text-ink-secondary">
            Đang kết nối dữ liệu danh mục xe từ máy chủ...
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredBikes.map((bike) => (
              <BikeCard key={bike.id} bike={bike} />
            ))}
          </div>
        )}
      </section>

      {/* Technical Pillar Strip */}
      <section className="mt-16 grid gap-6 border border-line bg-surface p-6 md:grid-cols-3">
        <div className="flex gap-3">
          <SlidersHorizontal className="h-5 w-5 shrink-0 text-signal" />
          <div>
            <h3 className="text-sm font-bold text-ink">Rider Sag & Độ Rộng Yên</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              Tính toán độ lún phuộc theo cân nặng + giáp bảo hộ và hao hụt sải chân do bề rộng mặt
              yên (Wrap Loss).
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Layers className="h-5 w-5 shrink-0 text-signal" />
          <div>
            <h3 className="text-sm font-bold text-ink">So sánh Ghost Overlay 1:1</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              Chồng khung hai mẫu xe theo tỷ lệ milimét thực để nhìn rõ chênh lệch tầm với tay lái
              và độ cao yên.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Compass className="h-5 w-5 shrink-0 text-signal" />
          <div>
            <h3 className="text-sm font-bold text-ink">Combo Hạ Yên Chuẩn Cơ Khí</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              Tự động gợi ý Link hạ phuộc và Yên thấp tương thích kèm cảnh báo khoảng sáng gầm minh
              bạch.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
