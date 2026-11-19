/**
 * EnsembleWeights — the "ensemble weights" card (P5b real-data round).
 *
 * Fix K: `Math.round(w*100)` could show weights summing to 99 or 101.
 * Now the weights show with ONE decimal exactly as loaded, and the
 * total line only renders when the sum equals 100% within rounding
 * (never force-normalised).  Only the production run's members are
 * shown.  Strings via i18n; display names from model_info.
 */
import { useTranslation } from 'react-i18next';
import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { MetricsResponse, MetricsTableRow } from '@/lib/api/types';

import { modelDisplayName } from './metrics-helpers';

interface Props {
  metrics: MetricsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function EnsembleWeights({ metrics, isLoading, isError, onRetry }: Props) {
  const { t } = useTranslation();

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
        title={t('common.dataUnavailable')}
        message={t('model.weightsLoadFailed')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }

  // Only the production run's members.
  const productionRun = (metrics?.metrics_json as { production_run?: string } | undefined)
    ?.production_run;
  const rows: MetricsTableRow[] = (metrics?.table.rows ?? []).filter(
    (r) =>
      r.ensemble_weight != null &&
      (productionRun == null || r.run === productionRun),
  );
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="scale"
        title={t('model.noWeightsTitle')}
        message={t('model.noWeightsMessage')}
      />
    );
  }

  const sorted = [...rows].sort(
    (a, b) => (b.ensemble_weight ?? 0) - (a.ensemble_weight ?? 0),
  );
  const max = Math.max(...sorted.map((r) => r.ensemble_weight ?? 0));
  // The total line ONLY when the exact weights sum to 100% within
  // rounding (P5b fix K — never force-normalised).
  const totalRaw = sorted.reduce((acc, r) => acc + (r.ensemble_weight ?? 0), 0);
  const showsTotal = Math.abs(totalRaw - 1.0) <= 0.0005;

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('model.ensembleWeights')}
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {t('model.ensembleWeightsSubtitle')}
        </p>
        <div className="mt-space-md flex flex-col gap-3">
          {sorted.map((r) => {
            const w = r.ensemble_weight ?? 0;
            const pctText = (w * 100).toFixed(1); // exact one-decimal, never re-rounded to 99/101
            const widthPct = max > 0 ? (w / max) * 100 : 0;
            return (
              <div key={`${r.run}-${r.model}`} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-regular text-on-surface truncate">
                    {modelDisplayName(metrics, r.model)}
                  </span>
                  <span className="text-label-metric font-label-metric text-on-surface-variant tabular-nums">
                    {pctText}%
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
        {showsTotal && (
          <p className="mt-3 text-caption-sm text-secondary tabular-nums">
            {t('model.weightsTotal')}
          </p>
        )}
      </div>
    </ValuationCard>
  );
}
