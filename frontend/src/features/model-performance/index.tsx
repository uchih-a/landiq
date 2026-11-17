/**
 * Model Performance — the F7 screen.
 *
 * P5 fidelity pass: wired in the live /model/predictions and
 * /model/error-by-support endpoints (known-gaps #49 RESOLVED). The
 * actual-vs-predicted scatter and error-by-support bars now render
 * real data instead of placeholder text.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Model Performance                                                 │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  KPI row (4 stats from weighted_ensemble row)                     │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Model comparison bars + CI whiskers                              │
 *   ├──────────────────────────────────────┬───────────────────────────┤
 *   │  Ensemble weights (5 cols)            │  Do ranges hold? (7 cols) │
 *   ├──────────────────────────────────────┴───────────────────────────┤
 *   │  Actual vs Predicted scatter (NEW — P5 wiring)                   │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Error by listings nearby (NEW — P5 wiring)                       │
 *   └──────────────────────────────────────────────────────────────────┘
 */
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components';
import { useErrorBySupport, useModelMetrics, useModelPredictions } from '@/lib/api/hooks';
import type { MetricsResponse } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency/format';

import { ActualVsPredicted } from './ActualVsPredicted';
import { CoverageBars } from './CoverageBars';
import { EnsembleWeights } from './EnsembleWeights';
import { ErrorBySupportBars } from './ErrorBySupportBars';
import { MetricsKpiRow } from './MetricsKpiRow';
import { ModelComparison } from './ModelComparison';
import { pickEnsembleRow } from './metrics-helpers';

export default function ModelPerformance() {
  const { t } = useTranslation();
  const metricsQ = useModelMetrics();
  const predictionsQ = useModelPredictions(500);
  const errorBySupportQ = useErrorBySupport();
  const metrics: MetricsResponse | undefined = metricsQ.data;
  const ensembleRow = pickEnsembleRow(metrics);
  const maeKsh = ensembleRow?.test_MAE_KSh_per_acre;

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      <header className="flex flex-col gap-space-md pt-2">
        <div>
          <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
            {t('model.title')}
          </h1>
          <p className="mt-2 text-body-regular text-on-surface-variant">
            Cross-validated accuracy, calibration, and the contribution of each ensemble member.
          </p>
        </div>
      </header>

      {metricsQ.isError ? (
        <EmptyState
          icon="cloud_off"
          title={t('common.dataUnavailable')}
          message="The model metrics feed is unavailable."
          actionLabel={t('common.retry')}
          onAction={() => metricsQ.refetch()}
        />
      ) : (
        <>
          <MetricsKpiRow metrics={metrics} isLoading={metricsQ.isLoading} />

          {maeKsh != null && (
            <p className="text-caption-sm text-secondary -mt-space-xl">
              Weighted ensemble average absolute error: {formatMoney(maeKsh)} per acre.
            </p>
          )}

          <ModelComparison
            metrics={metrics}
            isLoading={metricsQ.isLoading}
            isError={metricsQ.isError}
            onRetry={() => metricsQ.refetch()}
          />

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5">
              <EnsembleWeights
                metrics={metrics}
                isLoading={metricsQ.isLoading}
                isError={metricsQ.isError}
                onRetry={() => metricsQ.refetch()}
              />
            </div>
            <div className="lg:col-span-7">
              <CoverageBars
                metrics={metrics}
                isLoading={metricsQ.isLoading}
                isError={metricsQ.isError}
                onRetry={() => metricsQ.refetch()}
              />
            </div>
          </section>

          {/* P5: Actual vs Predicted scatter (replaces placeholder) */}
          <ActualVsPredicted query={predictionsQ} />

          {/* P5: Error by listings nearby (replaces placeholder text) */}
          <ErrorBySupportBars query={errorBySupportQ} />
        </>
      )}
    </div>
  );
}
