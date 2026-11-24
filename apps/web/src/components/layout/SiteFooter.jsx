import Link from 'next/link';
import { SHOWROOMS } from '@dirtfit/shared/enums';

/**
 * Clean Industrial Motorsport footer listing showrooms and technical routes.
 * @returns {import('react').JSX.Element}
 */
export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1360px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-12">
        <div className="md:col-span-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 bg-signal" />
            <span className="font-display text-base font-extrabold tracking-tight text-ink">
              DIRTFIT COMMERCE
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
            Chuyên xe máy địa hình Motocross, Enduro, Dual-Sport, Adventure và phụ tùng hạ yên tối
            ưu vóc dáng người Việt với công cụ mô phỏng 2D chuẩn milimét.
          </p>
        </div>

        <div className="md:col-span-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Hệ thống 3 Showroom Lái Thử
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-secondary">
            {SHOWROOMS.map((s) => (
              <li key={s.code} className="flex flex-col">
                <span className="font-medium text-ink">{s.name}</span>
                <span className="text-xs text-ink-muted">{s.address}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Điều hướng nhanh
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-secondary">
            <li>
              <Link href="/bikes" className="hover:text-signal">
                Danh mục xe & Rider Fit
              </Link>
            </li>
            <li>
              <Link href="/compare" className="hover:text-signal">
                So sánh Ghost Overlay
              </Link>
            </li>
            <li>
              <Link href="/accessories" className="hover:text-signal">
                Phụ kiện & Hạ yên
              </Link>
            </li>
            <li>
              <Link href="/test-ride" className="hover:text-signal">
                Đặt lịch lái thử
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line bg-canvas px-4 py-4 text-center text-xs text-ink-muted">
        DirtFit Commerce · Pure JS ESM Architecture · Precision Ergonomics Engine
      </div>
    </footer>
  );
}
