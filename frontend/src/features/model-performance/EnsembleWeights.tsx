/**
 * EnsembleWeights — the F7 "ensemble weights" card.
 *
 * For each model in the metrics table whose `ensemble_weight` is non-null,
 * renders a horizontal percentage bar showing that member's share of the
 * weighted ensemble. Bars are scaled relative to the largest weight in
 * the displayed set so the heaviest member fills the track and the rest
 * sit at proportional widths.
 *
 * `ensemble_weight` is treated as a fraction (0..1) — multiply by 100
 * for the percentage label. If the backend ever ships 0..100 values, the
 * percentage label would render with two extra zeros, which is an
 * obvious signal to revisit this assumption.
 */
import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { MetricsResponse, MetricsTableRow } from '@/lib/api/types';

interface Props {
  metrics: MetricsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function EnsembleWeights({ metrics, isLoading, isError, onRetry }: Props) {
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
        title="Couldn't load weights"
        message="The model metrics feed is unavailable."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }

  const rows: MetricsTableRow[] = (metrics?.table.rows ?? []).filter(
    (r) => r.ensemble_weight != null,
  );
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="scale"
        title="No ensemble weights"
        message="No models in the metrics table carry an ensemble weight."
      />
    );
  }

  const sorted = [...rows].sort(
    (a, b) => (b.ensemble_weight ?? 0) - (a.ensemble_weight ?? 0),
  );
  const max = Math.max(...sorted.map((r) => r.ensemble_weight ?? 0));

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          Ensemble weights
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          Share of the weighted ensemble assigned to each member model.
        </p>
        <div className="mt-space-md flex flex-col gap-3">
          {sorted.map((r) => {
            const w = r.ensemble_weight ?? 0;
            const pct = Math.round(w * 100);
            const widthPct = max > 0 ? (w / max) * 100 : 0;
            return (
              <div key={`${r.run}-${r.model}`} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-regular text-on-surface truncate">
                    {r.model}
                  </span>
                  <span className="text-label-metric font-label-metric text-on-surface-variant tabular-nums">
                    {pct}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-container-highest overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary-container transition-all duration-500"
                    style={{ width: `${widthPct}%` }}
                    role="presentation"
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
