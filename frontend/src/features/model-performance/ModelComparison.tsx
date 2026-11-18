/**
 * ModelComparison — the "Model comparison" card (P5b real-data round).
 *
 * Fixes:
 *  - B (unit bug): the CI tooltip used Math.round() on ~0.5 log-scale
 *    values, showing a meaningless "0 - 1" CI.  Now the log-scale values
 *    show with 3 decimals, the axis is labelled "RMSE, log scale", and a
 *    one-line plain-language explanation converts a log error to an
 *    approximate typical-miss percentage via exp(x)-1 (computed from the
 *    data, formula documented in metrics-helpers).
 *  - C (multi-run rows): the chart maps only the PRODUCTION run's rows
 *    (metrics_json.production_run), and the card subtitle shows the run
 *    name + date from `production_run_label`.
 *  - E/I: model display names + the TabNet-style grey styling come from
 *    the backend's model_info (family === 'neural' -> grey + footnote),
 *    not substring matching.  Colours are the design's tokens.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import type { MetricsResponse } from '@/lib/api/types';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  CHART_COLOR_ON_SURFACE as PARITY_INK,
  CHART_COLOR_ON_SURFACE_VARIANT as AXIS_INK,
  CHART_COLOR_PRIMARY_CONTAINER as PRIMARY_CONTAINER,
  CHART_COLOR_SECONDARY as NEURAL_COLOR,
} from '@/lib/ui/chart-tokens';

import { logErrorToPct, modelDisplayName, modelFamily } from './metrics-helpers';

interface Props {
  metrics: MetricsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

interface BarDatum {
  model: string;
  display: string;
  family: string;
  rmse: number;
  errLow: number;
  errHigh: number;
}

// Design tokens imported from ./chart-tokens (single source of truth).

function ComparisonTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BarDatum }>;
}) {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-body-medium font-body-medium text-on-surface">
        {p.display}
      </div>
      {/* P5b fix B: log-scale RMSE with 3 decimals (Math.round on a ~0.5
          value showed a meaningless "0 - 1" CI). */}
      <div className="text-caption-sm text-on-surface-variant tabular-nums">
        {t('model.rmseLog', { v: p.rmse.toFixed(3) })}
      </div>
      <div className="text-caption-sm text-secondary tabular-nums">
        {t('model.ci95', {
          lo: (p.rmse - p.errLow).toFixed(3),
          hi: (p.rmse + p.errHigh).toFixed(3),
        })}
      </div>
      {/* Plain-language conversion (exp(x)-1), labelled approximate. */}
      <div className="text-caption-sm text-secondary">
        ≈ {t('model.approxMiss', { pct: logErrorToPct(p.rmse).toFixed(0) })}
      </div>
    </div>
  );
}

export function ModelComparison({ metrics, isLoading, isError, onRetry }: Props) {
  const { t } = useTranslation();
  const locale = useLocale();

  // P5b fix C: ONLY the production run's rows (the table has one row per
  // (run, model); without this filter models appear multiple times).
  const data = useMemo<BarDatum[]>(() => {
    if (!metrics) return [];
    const productionRun = (metrics.metrics_json as { production_run?: string } | undefined)
      ?.production_run;
    const rows = metrics.table.rows.filter(
      (r) => productionRun == null || r.run === productionRun,
    );
    return rows.map((r) => {
      const rmse = r.test_RMSE;
      return {
        model: r.model,
        display: modelDisplayName(metrics, r.model),
        family: modelFamily(metrics, r.model),
        rmse,
        errLow: Math.max(0, rmse - r.ci95_RMSE_lo),
        errHigh: Math.max(0, r.ci95_RMSE_hi - rmse),
      };
    });
  }, [metrics]);

  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-72 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title={t('common.dataUnavailable')}
        message={t('model.metricsLoadFailed')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }
  if (data.length === 0) {
    return (
      <EmptyState icon="bar_chart" title={t('model.noRows')} message={t('model.noRowsMessage')} />
    );
  }

  const hasNeural = data.some((d) => d.family === 'neural');

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('model.comparison')}
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {/* P5b: the run name + date from the response, not typed. */}
          {t('model.comparisonSubtitle', {
            run: metrics?.production_run_label ?? '',
          })}
        </p>

        {/* P5b fix B: one-line plain-language explanation of the log-scale
            unit, computed from the BEST model's actual RMSE via exp(x)-1. */}
        <p className="text-caption-sm text-secondary mt-2">
          {t('model.logScaleNote', {
            pct: logErrorToPct(data[0]?.rmse ?? 0).toFixed(0),
          })}
        </p>

        {/* Visually hidden table with the values (a11y — the CI whiskers
            are not the only carrier of the information). */}
        <div className="sr-only">
        <table>
          <caption>{t('model.comparison')}</caption>
          <thead>
            <tr>
              <th>{t('model.colModel')}</th>
              <th>{t('model.rmseLogHeader')}</th>
              <th>{t('model.ci95Header')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.model}>
                <td>{d.display}</td>
                <td>{d.rmse.toFixed(3)}</td>
                <td>
                  {(d.rmse - d.errLow).toFixed(3)}–{(d.rmse + d.errHigh).toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="mt-space-md h-72 md:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(27,21,18,0.08)"
                horizontal={false}
              />
              <XAxis
                type="number"
                stroke={AXIS_INK}
                tick={{ fill: AXIS_INK, fontSize: 12 }}
                tickFormatter={(v: number) => Number(v).toLocaleString(locale, { maximumFractionDigits: 2 })}
                label={{
                  value: t('model.rmseAxis'),
                  position: 'insideBottom',
                  offset: -2,
                  fill: AXIS_INK,
                  fontSize: 11,
                }}
              />
              <YAxis
                type="category"
                dataKey="display"
                stroke={AXIS_INK}
                tick={{ fill: AXIS_INK, fontSize: 12 }}
                width={150}
              />
              <Tooltip
                cursor={{ fill: 'rgba(27,21,18,0.04)' }}
                content={<ComparisonTooltip />}
              />
              <Bar dataKey="rmse" radius={[4, 4, 4, 4]} maxBarSize={28}>
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.family === 'neural' ? NEURAL_COLOR : PRIMARY_CONTAINER}
                  />
                ))}
                <ErrorBar
                  dataKey={['errLow', 'errHigh'] as unknown as string}
                  width={6}
                  strokeWidth={1.5}
                  stroke={PARITY_INK}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Neural-family footnote (the backend's family field replaces the
            TabNet substring check). */}
        {hasNeural && (
          <p className="mt-space-md text-caption-sm text-secondary flex items-start gap-2">
            <span className="material-symbols-outlined text-[14px] mt-0.5" aria-hidden="true">
              history
            </span>
            <span>{t('model.neuralFootnote')}</span>
          </p>
        )}
      </div>
    </ValuationCard>
  );
}
