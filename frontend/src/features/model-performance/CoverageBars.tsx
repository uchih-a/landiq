/**
 * CoverageBars — the F7 "Do ranges hold?" card.
 *
 * Three horizontal bars showing target vs actual conformal coverage at
 * the 50%, 80%, and 90% levels. Each bar fills to the actual coverage
 * value (from the `weighted_ensemble` row's `interval_coverage_50/80/90`
 * fields) and carries a vertical tick marking the target level so the
 * viewer can see at a glance whether the ranges are over- or
 * under-covering.
 *
 * Coverage values are expected as fractions (0..1). If the backend ever
 * ships 0..100 values, the bars would overflow — revisit then.
 */
import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { MetricsResponse, MetricsTableRow } from '@/lib/api/types';

import { pickEnsembleRow } from './metrics-helpers';

interface Props {
  metrics: MetricsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

interface CoverageBar {
  level: string;
  target: number;
  actual: number | null;
}

function buildBars(row: MetricsTableRow | undefined): CoverageBar[] {
  if (!row) return [];
  return [
    { level: '50% range', target: 0.5, actual: row.interval_coverage_50 ?? null },
    { level: '80% range', target: 0.8, actual: row.interval_coverage_80 ?? null },
    { level: '90% range', target: 0.9, actual: row.interval_coverage_90 ?? null },
  ];
}

export function CoverageBars({ metrics, isLoading, isError, onRetry }: Props) {
  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-48 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title="Couldn't load coverage"
        message="The model metrics feed is unavailable."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }

  const row = pickEnsembleRow(metrics);
  const bars = buildBars(row);
  if (bars.every((b) => b.actual == null)) {
    return (
      <EmptyState
        icon="tune"
        title="No coverage data"
        message="Interval coverage fields are not present on the ensemble row."
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          Do ranges hold?
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          Target conformal coverage vs the share of test listings whose actual price landed inside the predicted range.
        </p>
        <div className="mt-space-md flex flex-col gap-4">
          {bars.map((b) => {
            const actualPct =
              b.actual != null ? Math.round(b.actual * 100) : null;
            const targetPct = Math.round(b.target * 100);
            const barWidth = actualPct != null ? Math.min(100, actualPct) : 0;
            return (
              <div key={b.level} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-regular text-on-surface">
                    {b.level}
                  </span>
                  <span className="text-label-metric font-label-metric text-on-surface-variant tabular-nums">
                    {actualPct != null ? `${actualPct}%` : '—'}{' '}
                    <span className="text-secondary">/ target {targetPct}%</span>
                  </span>
                </div>
                <div className="relative h-3 w-full rounded-full bg-surface-container-highest">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-market-opportunity transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                    role="presentation"
                  />
                  {/* Target marker — vertical tick at the target % across the track. */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 bg-on-surface"
                    style={{ left: `${targetPct}%` }}
                    title={`Target: ${targetPct}%`}
                    aria-label={`Target ${targetPct}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ValuationCard>
  );
}
