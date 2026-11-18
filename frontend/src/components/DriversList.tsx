/**
 * DriversList — "What drives this price" horizontal bar list.
 *
 * SHARED COMPONENT (P6b): originally the Predictor's result card; the
 * Explainability screen's "One estimate" mode now reuses it to render the
 * stored estimate's drivers, so the per-estimate driver UI exists exactly
 * once in the app.  Lives in src/components for that reason.
 *
 * Renders `response.explanation.drivers` (DriverContribution[]) as a list of
 * horizontal bars. Each bar shows:
 *   - the feature label
 *   - a colored bar whose width is proportional to |effect_pct| (relative to
 *     the largest driver in the displayed set)
 *   - the effect_pct value with sign (+ / -)
 *
 * The backend returns drivers sorted by |shap_value|, but we re-sort
 * defensively in case a future caller passes an unsorted list.
 *
 * Color rule (per 02_predictor_reliable/code.html design) — all colours
 * come from tailwind design tokens (no inline hex):
 *   - direction === 'price-increasing' → primary-container (the brand's
 *     orange accent — NOT green; the design uses orange for positive
 *     drivers and a tempered slate for negative ones, avoiding the
 *     green=good/red=bad convention in favor of a more analytical tone).
 *   - direction === 'price-decreasing' → market-neutral (tempered slate
 *     #6B7A90 — a neutral, non-alarming colour).  Label text also shifts
 *     to text-secondary (lighter) for negative drivers, matching the
 *     design.
 *   - direction === 'neutral'           → market-caution (amber #E3A008).
 */
import { useTranslation } from 'react-i18next';

import type { DriverContribution } from '@/lib/api/types';

interface DriversListProps {
  drivers: DriverContribution[];
  /** Max number of drivers to show (default 5 per spec). */
  limit?: number;
}

const NEUTRAL_COLOR = 'bg-market-caution';
const NEUTRAL_TEXT = 'text-market-caution';

function colorFor(d: DriverContribution): { bar: string; text: string; label: string } {
  if (d.direction === 'price-increasing') {
    // Design: positive drivers use primary-container orange
    return { bar: 'bg-primary-container', text: 'text-primary-container', label: 'text-on-surface' };
  }
  if (d.direction === 'price-decreasing') {
    // Design: negative drivers use market-neutral (tempered slate) + lighter label
    return { bar: 'bg-market-neutral', text: 'text-market-neutral', label: 'text-secondary' };
  }
  return { bar: NEUTRAL_COLOR, text: NEUTRAL_TEXT, label: 'text-on-surface' };
}

export function DriversList({ drivers, limit = 5 }: DriversListProps) {
  const { t } = useTranslation();
  const sorted = [...drivers]
    .sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))
    .slice(0, limit);

  if (sorted.length === 0) {
    return (
      <p className="text-caption-sm text-secondary">{t('predictor.noDrivers')}</p>
    );
  }

  const maxAbs = Math.max(1, ...sorted.map((d) => Math.abs(d.effect_pct)));

  return (
    <div className="flex flex-col gap-4">
      {sorted.map((d) => {
        const widthPct = Math.min(100, (Math.abs(d.effect_pct) / maxAbs) * 100);
        const colors = colorFor(d);
        const sign = d.effect_pct >= 0 ? '+' : '';
        return (
          <div key={d.feature} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 text-label-metric font-label-metric">
              <span className={`${colors.label} truncate`}>{d.label}</span>
              <span className={`${colors.text} font-medium whitespace-nowrap`}>
                {sign}
                {d.effect_pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${colors.bar} transition-all duration-500 ease-out`}
                style={{ width: `${widthPct}%` }}
                role="presentation"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
