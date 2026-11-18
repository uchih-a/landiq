/**
 * Model Performance — the F7 screen (P5b real-data round).
 *
 * Every fix of the round is applied across the child components (see
 * their headers).  This index adds:
 *  - a plain-language summary line under the KPI row, built entirely
 *    from the response (n_test, MedAPE, default-level coverage) via
 *    i18n interpolation — any clause whose data is null is hidden;
 *  - the "Weighted ensemble average absolute error" line as an i18n
 *    string with the shared money formatter (hidden when null);
 *  - the subtitle via i18n (was an English-only literal).
 */
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components';
import { useFormatNumber } from '@/lib/i18n/useLocale';
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
  // P7b-F: the active locale's grouping (en-KE / sw-KE), never a typed one.
  const formatNumber = useFormatNumber();
  const metricsQ = useModelMetrics();
  const predictionsQ = useModelPredictions(500);
  const errorBySupportQ = useErrorBySupport();
  const metrics: MetricsResponse | undefined = metricsQ.data;
  const ensembleRow = pickEnsembleRow(metrics);
  const maeKsh = ensembleRow?.test_MAE_KSh_per_acre ?? null;

  // ---- Plain-language summary (all numbers from the response; any
  //      clause whose data is null is hidden). ----
  const summaryParts: string[] = [];
  const nTest = metrics?.n_test ?? null;
  const medAPE = ensembleRow?.test_MedAPE_pct ?? null;
  const defaultLevel = metrics?.default_interval_level ?? null;
  if (ensembleRow != null && defaultLevel != null) {
    const pct = Math.round(defaultLevel * 100);
    const field = (ensembleRow as unknown as Record<string, unknown>)[
      `interval_coverage_${pct}`
    ];
    const coverage =
      typeof field === 'number' && Number.isFinite(field) ? field : null;
    if (nTest != null && medAPE != null && coverage != null) {
      summaryParts.push(
        t('model.summaryLine', {
          n: formatNumber(nTest),
          pct: medAPE.toFixed(1),
          range: pct,
          coverage: (coverage * 100).toFixed(0),
        }),
      );
    }
  }

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      <header className="flex flex-col gap-space-md pt-2">
        <div>
          <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
            {t('model.title')}
          </h1>
          <p className="mt-2 text-body-regular text-on-surface-variant">
            {t('model.subtitle')}
          </p>
          {/* P5b: the production run + date from the response. */}
          {metrics?.production_run_label && (
            <p className="mt-1 text-caption-sm text-secondary">
              {metrics.production_run_label}
            </p>
          )}
        </div>
      </header>

      {metricsQ.isError ? (
        <EmptyState
          icon="cloud_off"
          title={t('common.dataUnavailable')}
          message={t('model.metricsLoadFailed')}
          actionLabel={t('common.retry')}
          onAction={() => metricsQ.refetch()}
        />
      ) : (
        <>
          <MetricsKpiRow metrics={metrics} isLoading={metricsQ.isLoading} />

          {/* Plain-language summary line (from the response). */}
          {summaryParts.length > 0 && (
            <p className="text-caption-sm text-secondary -mt-space-xl" role="status">
              {summaryParts.join(' ')}
            </p>
          )}

          {maeKsh != null && ensembleRow != null && (
            <p className="text-caption-sm text-secondary -mt-space-xl">
              {t('model.maeLine', {
                value: formatMoney(maeKsh),
              })}
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

          {/* Actual vs Predicted scatter (wired in P5). */}
          <ActualVsPredicted query={predictionsQ} />

          {/* Error by listings nearby (wired in P5; band_order + data
              bands in P5b). */}
          <ErrorBySupportBars query={errorBySupportQ} />
        </>
      )}
    </div>
  );
}
