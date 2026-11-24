'use client';

import { SUPPORTED_LOCALES } from '@/lib/i18n/config';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Compact Industrial Motorsport monospace `EN | VI` segmented language toggle.
 * @param {object} [props]
 * @param {boolean} [props.compact]
 * @returns {import('react').JSX.Element}
 */
export default function LocaleToggle({ compact = false }) {
  const { locale, setLocale } = useI18n();

  return (
    <div
      role="group"
      aria-label="Language selector"
      className="inline-flex shrink-0 items-center overflow-hidden rounded-sm border border-line-strong bg-surface font-mono tabular-telemetry"
    >
      {SUPPORTED_LOCALES.map((code, idx) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className={`${compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[11px]'} font-bold uppercase tracking-wider transition-colors ${
              idx > 0 ? 'border-l border-line-strong' : ''
            } ${
              active
                ? 'bg-ink text-surface'
                : 'bg-surface text-ink-secondary hover:bg-canvas hover:text-ink'
            }`}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
