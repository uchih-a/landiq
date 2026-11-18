/**
 * GlobalShapBars — the "What matters most overall" card.
 *
 * Renders a horizontal Recharts BarChart of the top features by mean
 * absolute SHAP value for the SELECTED tree model.  P6b: the model comes
 * from the response — the backend serves the ensemble member list
 * (`models` with display_name / family / ensemble_weight / has_shap) plus
 * `default_model` (the highest-weight SHAP-covered member); this card
 * never hard-wires a member key.  A small model selector renders ONLY when more
 * than one SHAP-covered model exists; otherwise the caption names the
 * single model.
 *
 * Feature keys resolve to human-readable labels via the
 * `feature_labels` map; keys without a label fall back to the raw
 * feature name.
 *
 * Bars encode the mean absolute SHAP value — the average size of the
 * feature's push on the predicted LOG price per acre (NOT a share of
 * price variation).  The axis label and the synthesis card's unit
 * sentence both say this in plain words.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import type { ExplainabilityModel, FeatureLabel, ShapGlobalRow } from '@/lib/api/types';
import {
  CHART_COLOR_ON_SURFACE_VARIANT,
  CHART_COLOR_PRIMARY_CONTAINER,
} from '@/lib/ui/chart-tokens';

interface Props {
  rows: ShapGlobalRow[] | undefined;
  labels: Record<string, FeatureLabel> | undefined;
  models: ExplainabilityModel[] | undefined;
  /** The backend's default_model (highest-weight SHAP-covered member). */
  defaultModel: string | null | undefined;
  /** The currently selected member key (lifted so the synthesis agrees). */
  selectedModel: string | null;
  onSelectModel: (key: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

interface BarDatum {
  feature: string;
  label: string;
  mean_abs_shap: number;
}

/**
 * Display density: how many bars the chart shows.  A NAMED UI constant,
 * defined once — NOT a data fact.  The caption interpolates the number
 * actually shown (fewer when the payload has fewer rows).
 */
const TOP_N_BARS = 10;

function ShapTooltip({
  active,
  payload,
  unitLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: BarDatum }>;
  unitLabel: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-body-medium font-body-medium text-on-surface">{p.label}</div>
      <div className="text-caption-sm text-on-surface-variant tabular-nums">
        {p.mean_abs_shap.toFixed(4)} · {unitLabel}
      </div>
    </div>
  );
}

export function GlobalShapBars({
  rows,
  labels,
  models,
  selectedModel,
  onSelectModel,
  isLoading,
  isError,
  onRetry,
}: Props) {
  const { t } = useTranslation();

  const model = useMemo<ExplainabilityModel | null>(() => {
    if (!models) return null;
    return models.find((m) => m.key === selectedModel) ?? null;
  }, [models, selectedModel]);

  const data = useMemo<BarDatum[]>(() => {
    if (!rows || selectedModel === null) return [];
    return [...rows]
      .filter((r) => r.model === selectedModel)
      .sort((a, b) => b.mean_abs_shap - a.mean_abs_shap)
      .slice(0, TOP_N_BARS)
      .map((r) => ({
        feature: r.feature,
        label: labels?.[r.feature]?.label ?? r.feature,
        mean_abs_shap: r.mean_abs_shap,
      }));
  }, [rows, labels, selectedModel]);

  const displayName = model?.display_name ?? selectedModel ?? '';

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
        title={t('explain.loadFailedTitle')}
        message={t('explain.feedUnavailable')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }
  if (selectedModel === null) {
    // No SHAP-covered member in the response's model list — honest empty
    // state (the backend reports has_shap per member).
    return (
      <EmptyState
        icon="lightbulb"
        title={t('explain.noShapData')}
        message={t('explain.noShapDataMessage')}
      />
    );
  }
  if (data.length === 0) {
    return (
      <EmptyState
        icon="lightbulb"
        title={t('explain.noShapData')}
        message={t('explain.noShapRows', { model: displayName })}
      />
    );
  }

  const shapModels = (models ?? []).filter((m) => m.has_shap);
  const showSelector = shapModels.length > 1;

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-headline-section text-headline-section text-on-surface">
            {t('explain.whatMattersMost')}
          </h2>
          {showSelector && (
            <div
              role="radiogroup"
              aria-label={t('explain.modelSelectorLabel')}
              className="inline-flex p-1 rounded-full bg-surface-container-highest"
            >
              {shapModels.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={m.key === selectedModel}
                  onClick={() => onSelectModel(m.key)}
                  className={`px-3 py-1.5 rounded-full text-caption-sm font-caption-sm transition-colors ${
                    m.key === selectedModel
                      ? 'bg-on-surface text-white'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {m.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {t('explain.barsCaption', { n: data.length, model: displayName })}
        </p>
        <div
          className="mt-space-md h-80 w-full"
          role="img"
          aria-label={t('explain.barsA11yName', { n: data.length, model: displayName })}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ top: 4, right: 24, bottom: 20, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(27,21,18,0.08)"
                horizontal={false}
              />
              <XAxis
                type="number"
                stroke={CHART_COLOR_ON_SURFACE_VARIANT}
                tick={{ fill: CHART_COLOR_ON_SURFACE_VARIANT, fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="label"
                stroke={CHART_COLOR_ON_SURFACE_VARIANT}
                tick={{ fill: CHART_COLOR_ON_SURFACE_VARIANT, fontSize: 12 }}
                width={170}
              />
              <Tooltip
                cursor={{ fill: 'rgba(27,21,18,0.04)' }}
                content={<ShapTooltip unitLabel={t('explain.barsTooltipLabel')} />}
              />
              <Bar
                dataKey="mean_abs_shap"
                fill={CHART_COLOR_PRIMARY_CONTAINER}
                radius={[0, 4, 4, 0]}
                maxBarSize={24}
              >
                <LabelList
                  dataKey="mean_abs_shap"
                  position="right"
                  formatter={(v: unknown) =>
                    typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—'
                  }
                  fill={CHART_COLOR_ON_SURFACE_VARIANT}
                  fontSize={11}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* The chart's unit, as a wrapping paragraph (an inside-SVG axis
            label clips on narrow viewports). Says what the bars measure —
            honest wording, no percentage claims. */}
        <p className="mt-2 text-caption-sm text-secondary">
          {t('explain.barsAxisLabel')}
        </p>
        {/* Hidden text summary — the chart's values, readable by screen
            readers (colour is never the only encoding; labels are visible). */}
        <div className="sr-only">
          <ul>
            {data.map((d) => (
              <li key={d.feature}>
                {d.label}: {d.mean_abs_shap.toFixed(4)} — {t('explain.barsTooltipLabel')}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ValuationCard>
  );
}
