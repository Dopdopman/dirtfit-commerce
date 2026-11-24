'use client';

const SIZE_MAP = {
  sm: { icon: 28, wordmark: 'text-sm', tag: 'text-[9px]' },
  md: { icon: 34, wordmark: 'text-lg', tag: 'text-[10px]' },
  lg: { icon: 42, wordmark: 'text-xl', tag: 'text-[11px]' },
};

/**
 * Custom Industrial Motorsport / Technical Blueprint Brand Logo for DirtFit Commerce.
 * Combines a chamfered Carbon Black housing, angular `D` chassis monogram,
 * USD fork rake geometry line, and 3 Signal Dirt Orange millimeter gauge ticks.
 * @param {object} [props]
 * @param {'full'|'mark'} [props.variant]
 * @param {'light'|'dark'} [props.theme]
 * @param {'sm'|'md'|'lg'} [props.size]
 * @param {string} [props.subtitle]
 * @returns {import('react').JSX.Element}
 */
export default function BrandLogo({
  variant = 'full',
  theme = 'light',
  size = 'md',
  subtitle = '',
}) {
  const dims = SIZE_MAP[size] ?? SIZE_MAP.md;
  const housingFill = theme === 'dark' ? '#1E2025' : '#111111';
  const strokeMain = '#FFFFFF';
  const wordmarkColor = theme === 'dark' ? 'text-surface' : 'text-ink';
  const badgeBorder =
    theme === 'dark' ? 'border-white/20 text-white/75' : 'border-line text-ink-muted';

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg
        width={dims.icon}
        height={dims.icon}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Chamfered Industrial Motorsport Frame */}
        <polygon points="4,2 34,2 38,6 38,34 34,38 2,38 2,4" fill={housingFill} />
        <polygon
          points="4,2 34,2 38,6 38,34 34,38 2,38 2,4"
          stroke={theme === 'dark' ? '#3F444E' : '#1C1E21'}
          strokeWidth="1"
        />

        {/* 3 Millimeter Calibration Ticks (Signal Dirt Orange) */}
        <rect x="6" y="10" width="4.5" height="2.2" fill="#E84C1E" />
        <rect x="6" y="18.8" width="6.5" height="2.4" fill="#E84C1E" />
        <rect x="6" y="27.8" width="4.5" height="2.2" fill="#E84C1E" />

        {/* Angular Chassis 'D' Monogram + USD Fork Rake Slash */}
        <path
          d="M15 9.5H23.5L31 15.5V24.5L23.5 30.5H15V9.5Z"
          stroke={strokeMain}
          strokeWidth="3.2"
          strokeLinejoin="miter"
        />
        {/* USD Fork Rake Angle Accent */}
        <line x1="21.5" y1="6.5" x2="29.5" y2="33.5" stroke="#E84C1E" strokeWidth="2.8" />
        <circle cx="29.5" cy="33.5" r="2.1" fill={strokeMain} />
      </svg>

      {variant === 'full' && (
        <span className="inline-flex items-center gap-2">
          <span
            className={`font-display font-extrabold tracking-tight ${dims.wordmark} ${wordmarkColor}`}
          >
            DIRTFIT
          </span>
          {subtitle && (
            <span
              className={`hidden border px-1.5 py-0.5 font-mono font-semibold uppercase tracking-widest sm:inline-block tabular-telemetry ${dims.tag} ${badgeBorder}`}
            >
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
