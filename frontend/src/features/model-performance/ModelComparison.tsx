/**
 * ModelComparison — the F7 "Model comparison" card.
 *
 * Horizontal Recharts BarChart of `test_RMSE` per model in the metrics
 * table, with 95% CI whiskers (`ci95_RMSE_lo` → `ci95_RMSE_hi`) drawn
 * via a Recharts `<ErrorBar>`.
 *
 * TabNet handling: if TabNet appears in the metrics table it is rendered
 * with a distinct grey bar and a footnote calling out that it is shown
 * for historical reference only — it may have been pruned from the
 * serving ensemble but is retained in the metrics table for context.
 */
import { useMemo } from 'react';
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

import { isTabNetRow } from './metrics-helpers';

interface Props {
  metrics: MetricsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

interface BarDatum {
  model: string;
  rmse: number;
  errLow: number;
  errHigh: number;
  isTabNet: boolean;
}

const PRIMARY_CONTAINER = '#e8742a';
const TABNET_COLOR = '#6a5b56';

function ComparisonTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BarDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-body-medium font-body-medium text-on-surface">
        {p.model}
      </div>
      <div className="text-caption-sm text-on-surface-variant tabular-nums">
        RMSE: {p.rmse.toLocaleString('en-KE')}
      </div>
      <div className="text-caption-sm text-secondary tabular-nums">
        95% CI: {Math.round(p.rmse - p.errLow)} – {Math.round(p.rmse + p.errHigh)}
      </div>
    </div>
  );
}

export function ModelComparison({ metrics, isLoading, isError, onRetry }: Props) {
  const data = useMemo<BarDatum[]>(() => {
    if (!metrics) return [];
    return metrics.table.rows.map((r) => {
      const rmse = r.test_RMSE;
      return {
        model: r.model,
        rmse,
        errLow: Math.max(0, rmse - r.ci95_RMSE_lo),
        errHigh: Math.max(0, r.ci95_RMSE_hi - rmse),
        isTabNet: isTabNetRow(r.model),
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
        title="Couldn't load metrics"
        message="The model metrics feed is unavailable."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }
  if (data.length === 0) {
    return (
      <EmptyState icon="bar_chart" title="No model rows" message="The metrics table is empty." />
    );
  }

  const hasTabNet = data.some((d) => d.isTabNet);

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          Model comparison
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          Test RMSE per model with 95% CI whiskers.
        </p>

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
                stroke="#574238"
                tick={{ fill: '#574238', fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="model"
                stroke="#574238"
                tick={{ fill: '#574238', fontSize: 12 }}
                width={150}
              />
              <Tooltip
                cursor={{ fill: 'rgba(27,21,18,0.04)' }}
                content={<ComparisonTooltip />}
              />
              <Bar dataKey="rmse" radius={[4, 4, 4, 4]} maxBarSize={28}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.isTabNet ? TABNET_COLOR : PRIMARY_CONTAINER} />
                ))}
                <ErrorBar
                  // Recharts v3 ships dataKey as `string | number | (obj) => any`
                  // in its type definitions, but the tuple form
                  // `[errLowKey, errHighKey]` IS supported at runtime for
                  // asymmetric whiskers. The cast keeps tsc happy without
                  // changing runtime behaviour.
                  dataKey={['errLow', 'errHigh'] as unknown as string}
                  width={6}
                  strokeWidth={1.5}
                  stroke="#1f1b16"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* NOTE: TabNet may appear in the metrics table even after it has
            been pruned from serving — the row is kept for historical
            reference only. The grey bar visually de-emphasises it and
            the footnote calls out the status. */}
        {hasTabNet && (
          <p className="mt-space-md text-caption-sm text-secondary flex items-start gap-2">
            <span className="material-symbols-outlined text-[14px] mt-0.5">history</span>
            <span>
              TabNet is shown for historical reference only — it may have been pruned from the serving ensemble but is retained in the metrics table for context.
            </span>
          </p>
        )}
      </div>
    </ValuationCard>
  );
}
