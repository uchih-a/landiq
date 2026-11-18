/**
 * TriStatePill — a three-state Yes / No / Not Sure segmented control.
 *
 * Used for the predictor's infrastructure checklist.  Maps cleanly to
 * the backend's `ChecklistValue = boolean | 'not_sure' | null` (Yes →
 * true, No → false, Not Sure → 'not_sure') via `triStateToChecklist`.
 *
 * P2b: labels go through i18n (`predictor.triState.yes` / `.no` /
 * `.unsure`).  Keyboard-operable via the radiogroup semantics.
 */
import { useTranslation } from 'react-i18next';

import type { TriState } from './predictor-helpers';

interface TriStatePillProps {
  value: TriState;
  onChange: (v: TriState) => void;
  className?: string;
}

const OPTIONS: TriState[] = ['yes', 'no', 'unsure'];

export function TriStatePill({ value, onChange, className = '' }: TriStatePillProps) {
  const { t } = useTranslation();
  return (
    <div
      className={`inline-flex items-center rounded-full bg-surface-container-highest p-0.5 ${className}`}
      role="radiogroup"
    >
      {OPTIONS.map((o) => {
        const active = value === o;
        const label = t(`predictor.triState.${o}`);
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => onChange(o)}
            className={`px-3 py-1 rounded-full text-caption-sm font-label-metric transition-colors duration-150 ${
              active
                ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
