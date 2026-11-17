/**
 * GlobalShapBars — the F8 "What matters most overall" card.
 *
 * Renders a horizontal Recharts BarChart of the top 10 features by mean
 * absolute SHAP value, filtered to the XGBoost member
 * (`shap_global[i].model === 'xgb'`). Feature keys are resolved to
 * human-readable labels via the `feature_labels` map; keys without a
 * label fall back to the raw feature name.
 */
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import type { FeatureLabel, ShapGlobalRow } from '@/lib/api/types';

interface Props {
  rows: ShapGlobalRow[] | undefined;
  labels: Record<string, FeatureLabel> | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

interface BarDatum {
  feature: string;
  label: string;
  mean_abs_shap: number;
}

const PRIMARY_CONTAINER = '#e8742a';

function ShapTooltip({
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
        {p.label}
      </div>
      <div className="text-caption-sm text-on-surface-variant tabular-nums">
        mean |SHAP| = {p.mean_abs_shap.toFixed(4)}
      </div>
    </div>
  );
}

export function GlobalShapBars({ rows, labels, isLoading, isError, onRetry }: Props) {
  const data = useMemo<BarDatum[]>(() => {
    if (!rows) return [];
    // Filter to the XGBoost member only — the ensemble has one tree
    // model in production and that's the source of the "global" view.
    const filtered = rows.filter((r) => r.model === 'xgb');
    const sorted = [...filtered]
      .sort((a, b) => b.mean_abs_shap - a.mean_abs_shap)
      .slice(0, 10);
    return sorted.map((r) => ({
      feature: r.feature,
      label: labels?.[r.feature]?.label ?? r.feature,
      mean_abs_shap: r.mean_abs_shap,
    }));
  }, [rows, labels]);

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
        title="Couldn't load SHAP"
        message="The global SHAP feed is unavailable."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }
  if (data.length === 0) {
    return (
      <EmptyState
        icon="lightbulb"
        title="No SHAP data"
        message="No xgb SHAP rows are present in the explainability payload."
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          What matters most overall
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          Top 10 features by mean absolute SHAP value · XGBoost member.
        </p>
        <div className="mt-space-md h-80 w-full">
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
                dataKey="label"
                stroke="#574238"
                tick={{ fill: '#574238', fontSize: 12 }}
                width={170}
              />
              <Tooltip
                cursor={{ fill: 'rgba(27,21,18,0.04)' }}
                content={<ShapTooltip />}
              />
              <Bar
                dataKey="mean_abs_shap"
                fill={PRIMARY_CONTAINER}
                radius={[0, 4, 4, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ValuationCard>
  );
}
