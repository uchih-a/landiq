/**
 * MetricsKpiRow — the 4-up KPI band (P5b real-data round).
 *
 * Every tile value + label comes from the response: the ensemble row is
 * resolved via `ensemble_model` (no fallbacks — "not available" when
 * absent), the coverage tile uses the DEFAULT interval level from
 * `default_interval_level` (never typed 0.8), percentages show one
 * decimal, and money goes through the shared currency-aware compact
 * formatter (the KSh/USD toggle applies).  Method names (e.g. the
 * interval method) are facts about the model surfaced from the response
 * (`interval_method`), not typed copy.
 */
import { useTranslation } from 'react-i18next';
import { KpiStatBlock, LoadingSkeleton } from '@/components';
import { ValuationCard } from '@/components/ValuationCard';
import type { MetricsResponse } from '@/lib/api/types';
import { formatCompactMoney } from '@/lib/currency/format';

import { pickEnsembleRow } from './metrics-helpers';

interface Props {
  metrics: MetricsResponse | undefined;
  isLoading: boolean;
}

export function MetricsKpiRow({ metrics, isLoading }: Props) {
  const { t } = useTranslation();

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
  const ensembleName =
    metrics?.model_info?.[metrics?.ensemble_model ?? '']?.display_name ??
    metrics?.ensemble_model ??
    null;
  // P5b: percentages keep ONE decimal (a whole number hides 12.4%).
  const typicalErrorPct =
    row && Number.isFinite(row.test_MedAPE_pct) ? row.test_MedAPE_pct.toFixed(1) : null;
  const r2 = row ? row.test_R2 : null;
  const mae = row ? row.test_MAE_KSh_per_acre : null;

  // The coverage tile uses the response's default interval level.
  const defaultLevel = metrics?.default_interval_level ?? null;
  const coverageEntry = (() => {
    if (row == null || defaultLevel == null) return null;
    const pct = Math.round(defaultLevel * 100);
    const field = (row as unknown as Record<string, unknown>)[`interval_coverage_${pct}`];
    return typeof field === 'number' && Number.isFinite(field)
      ? { pct, actual: field }
      : null;
  })();

  // Method line from the response (interval_method is a documented
  // backend fact; null -> omitted, never a typed "Conformal").
  const methodLine = metrics?.interval_method ?? null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <ValuationCard>
        <KpiStatBlock
          badge={t('model.typicalError')}
          value={typicalErrorPct != null ? `${typicalErrorPct}%` : '—'}
          label={t('model.medianPctError')}
          context={ensembleName ? t('model.methodLine', { name: ensembleName }) : t('model.notAvailable')}
        />
      </ValuationCard>
      <ValuationCard>
        <KpiStatBlock
          badge={t('model.varianceExplained')}
          value={r2 != null ? r2.toFixed(2) : '—'}
          label={t('model.r2Test')}
          context={ensembleName ?? t('model.notAvailable')}
        />
      </ValuationCard>
      <ValuationCard>
        <KpiStatBlock
          badge={t('model.avgError')}
          value={mae != null ? formatCompactMoney(mae) : '—'}
          label={t('model.maePerAcre')}
          context={ensembleName ?? t('model.notAvailable')}
        />
      </ValuationCard>
      <ValuationCard>
        <KpiStatBlock
          badge={t('model.intervalCoverage')}
          value={coverageEntry ? `${(coverageEntry.actual * 100).toFixed(1)}%` : '—'}
          label={
            coverageEntry
              ? t('model.rangeHitRate', { pct: coverageEntry.pct })
              : t('model.notAvailable')
          }
          context={methodLine ?? ensembleName ?? t('model.notAvailable')}
        />
      </ValuationCard>
    </div>
  );
}
