'use client';

import * as Slider from '@radix-ui/react-slider';

/**
 * Accessible Radix Slider paired with tabular monospace telemetry readout.
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.value
 * @param {number} props.min
 * @param {number} props.max
 * @param {number} [props.step]
 * @param {string} props.unit
 * @param {(val: number) => void} props.onChange
 * @returns {import('react').JSX.Element}
 */
export default function TechnicalSlider({ label, value, min, max, step = 1, unit, onChange }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-secondary">{label}</span>
        <span className="font-semibold text-ink tabular-telemetry">
          {value} {unit}
        </span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(vals) => {
          if (typeof vals[0] === 'number') {
            onChange(vals[0]);
          }
        }}
        aria-label={label}
      >
        <Slider.Track className="relative h-[3px] w-full grow bg-line">
          <Slider.Range className="absolute h-full bg-signal" />
        </Slider.Track>
        <Slider.Thumb className="block h-4 w-4 rounded-sm border border-line-strong bg-surface shadow-sm transition-transform focus:outline-none focus:ring-2 focus:ring-signal" />
      </Slider.Root>
    </div>
  );
}
