/**
 * MetricsKpiRow — the 4-up KPI band at the top of the Model Performance
 * screen.
 *
 * Each stat comes from the `weighted_ensemble` row of the metrics table
 * (resolved via `pickEnsembleRow`):
 *
 *   1. Typical error   -> test_MedAPE_pct        (median absolute % error)
 *   2. R²              -> test_R2                (variance explained)
 *   3. Average error   -> test_MAE_KSh_per_acre  (mean abs KSh/acre)
 *   4. Interval cov.   -> interval_coverage_80   (share of test listings
 *                                  whose actual price fell in the 80% range)
 */
import { KpiStatBlock, LoadingSkeleton } from '@/components';
import { ValuationCard } from '@/components/ValuationCard';
import type { MetricsResponse } from '@/lib/api/types';

import { formatCompactKSh, pickEnsembleRow } from './metrics-helpers';

interface Props {
  metrics: MetricsResponse | undefined;
  isLoading: boolean;
}

export function MetricsKpiRow({ metrics, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ValuationCard key={i}>
            <div className="flex flex-col gap-2">
              <LoadingSkeleton className="h-3 w-20" />
              <LoadingSkeleton className="h-10 w-28" />
              <LoadingSkeleton className="h-3 w-24" />
            </div>
          </ValuationCard>
        ))}
      </div>
    );
  }

  const row = pickEnsembleRow(metrics);
  const typicalErrorPct =
    row && Number.isFinite(row.test_MedAPE_pct)
      ? Math.round(row.test_MedAPE_pct)
      : null;
  const r2 = row ? row.test_R2 : null;
  const mae = row ? row.test_MAE_KSh_per_acre : null;
  const coverage =
    row && row.interval_coverage_80 != null
      ? Math.round(row.interval_coverage_80 * 100)
      : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <ValuationCard>
        <KpiStatBlock
          badge="Typical error"
          value={typicalErrorPct != null ? `${typicalErrorPct}%` : '—'}
          label="Median % error"
          context="Weighted ensemble · MedAPE"
        />
      </ValuationCard>
      <ValuationCard>
        <KpiStatBlock
          badge="Variance explained"
          value={r2 != null ? r2.toFixed(2) : '—'}
          label="R² (test)"
          context="Weighted ensemble"
        />
      </ValuationCard>
      <ValuationCard>
        <KpiStatBlock
          badge="Average error"
          value={mae != null ? formatCompactKSh(mae) : '—'}
          label="MAE per acre"
          context="Weighted ensemble"
        />
      </ValuationCard>
      <ValuationCard>
        <KpiStatBlock
          badge="Interval coverage"
          value={coverage != null ? `${coverage}%` : '—'}
          label="80% range hit rate"
          context="Conformal · weighted ensemble"
        />
      </ValuationCard>
    </div>
  );
}
