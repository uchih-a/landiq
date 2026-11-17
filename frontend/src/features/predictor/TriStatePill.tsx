/**
 * TriStatePill — a three-state Yes / No / Not Sure segmented control.
 *
 * Used for the predictor's infrastructure checklist (10 items) and for the
 * frontend-only Title Documentation field on the unsupported state. Maps
 * cleanly to the backend's `ChecklistValue = boolean | 'not_sure' | null`
 * (Yes → true, No → false, Not Sure → 'not_sure') via `triStateToChecklist`.
 */
import type { TriState } from './predictor-helpers';

interface TriStatePillProps {
  value: TriState;
  onChange: (v: TriState) => void;
  className?: string;
}

const OPTIONS: { v: TriState; label: string }[] = [
  { v: 'yes', label: 'Yes' },
  { v: 'no', label: 'No' },
  { v: 'unsure', label: 'Not Sure' },
];

export function TriStatePill({ value, onChange, className = '' }: TriStatePillProps) {
  return (
    <div
      className={`inline-flex items-center rounded-full bg-surface-container-highest p-0.5 ${className}`}
      role="radiogroup"
    >
      {OPTIONS.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.v)}
            className={`px-3 py-1 rounded-full text-caption-sm font-label-metric transition-colors duration-150 ${
              active
                ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
