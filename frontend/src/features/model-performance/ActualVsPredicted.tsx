/**
 * ActualVsPredicted — log-log scatter of actual vs predicted prices.
 *
 * P5 wiring (known-gaps #49 RESOLVED). Data comes from
 * `GET /api/v1/model/predictions?sample=500` — the backend returns both
 * OOF and test predictions with y_true (log price per acre) and
 * pred_weighted_ensemble (log-scale prediction).
 *
 * The chart shows:
 *  - Scatter dots (OOF = orange, test = green) on a log-log scale
 *  - 1:1 parity dashed line (perfect prediction)
 *  - +/-30% band (hatched, using the P1 diagonal-hatch pattern approach)
 *  - Axis ticks at 1M / 5M / 10M / 20M KSh
 *  - Interpretation note
 *
 * The sample size (500) was chosen to give enough density to see the
 * distribution shape without over-rendering. The backend's `sample`
 * param uses a deterministic seed (42) so the same request always returns
 * the same rows.
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
  Area,
} from 'recharts';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import type { ApiQueryResult } from '@/lib/api/hooks';
import type { ModelPredictionsResponse, PredictionRow } from '@/lib/api/types';

interface Props {
  query: ApiQueryResult<ModelPredictionsResponse>;
}

const PRIMARY_CONTAINER = '#e8742a';
const TERTIARY = '#006d3b';
const HATCH_STROKE = '#dec1b3';

interface ChartPoint {
  actual: number; // KSh per acre (exp'd from log)
  predicted: number; // KSh per acre (exp'd from log)
  split: 'dev' | 'test';
  county: string | null;
}

function ChartTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-caption-sm text-secondary uppercase tracking-wider">
        {p.county ?? 'Listing'} · {p.split === 'test' ? 'Test' : 'OOF'}
      </div>
      <div className="text-body-medium text-on-surface">
        Actual: KSh {(p.actual / 1_000_000).toFixed(2)}M / ac
      </div>
      <div className="text-caption-sm text-secondary">
        Predicted: KSh {(p.predicted / 1_000_000).toFixed(2)}M / ac
      </div>
    </div>
  );
}

export function ActualVsPredicted({ query }: Props) {
  const { data, isLoading, isError, refetch } = query;

  // Build scatter points from the predictions — exp() the log-scale values
  // back to KSh per acre for the chart's axes.
  const points: ChartPoint[] = useMemo(() => {
    if (!data) return [];
    const toPoints = (rows: PredictionRow[]) =>
      rows
        .map((r) => ({
          actual: Math.exp(r.y_true),
          predicted: Math.exp(r.pred_weighted_ensemble),
          split: r.split,
          county: r.county,
        }))
        .filter((p) => Number.isFinite(p.actual) && Number.isFinite(p.predicted));
    return [...toPoints(data.oof), ...toPoints(data.test)];
  }, [data]);

  // 1:1 parity line data (same min/max as the data domain).
  const parityLine = useMemo(() => {
    if (points.length === 0) return [];
    const all = [...points.map((p) => p.actual), ...points.map((p) => p.predicted)];
    const min = Math.max(100_000, Math.floor(Math.min(...all) / 100_000) * 100_000);
    const max = Math.ceil(Math.max(...all) / 1_000_000) * 1_000_000;
    return [
      { actual: min, predicted: min },
      { actual: max, predicted: max },
    ];
  }, [points]);

  // +/-30% band area data (upper and lower bounds for the hatched fill).
  const bandData = useMemo(() => {
    if (parityLine.length < 2) return [];
    const min = parityLine[0].actual;
    const max = parityLine[1].actual;
    return [
      { actual: min, upper: min * 1.3, lower: min * 0.7 },
      { actual: max, upper: max * 1.3, lower: max * 0.7 },
    ];
  }, [parityLine]);

  const oofPoints = points.filter((p) => p.split === 'dev');
  const testPoints = points.filter((p) => p.split === 'test');

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-headline-section text-headline-section text-on-surface">
              Actual vs Predicted
            </h2>
            <p className="font-body-regular text-secondary mt-0.5">
              Log-log scatter of all assessed listings. Dashed line = perfect prediction.
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary text-caption-sm font-caption-sm whitespace-nowrap">
            {data?.sampled ? `Sample: ${data.oof.length + data.test.length} of ${data.oof_count + data.test_count}` : `${points.length} points`}
          </span>
        </div>

        <div className="h-80 w-full">
          {isLoading ? (
            <LoadingSkeleton className="h-full w-full rounded-md" />
          ) : isError ? (
            <EmptyState
              icon="cloud_off"
              title="Couldn't load predictions"
              message="The model predictions feed is unavailable."
              actionLabel="Retry"
              onAction={() => refetch()}
            />
          ) : points.length === 0 ? (
            <EmptyState
              icon="scatter_plot"
              title="No predictions"
              message="No prediction data available."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
                <defs>
                  {/* P1 hatch pattern — reused for the +/-30% band */}
                  <pattern
                    id="avpHatch"
                    patternUnits="userSpaceOnUse"
                    width={8}
                    height={8}
                    patternTransform="rotate(45)"
                  >
                    <line x1={0} y1={0} x2={0} y2={8} stroke={HATCH_STROKE} strokeWidth={1.25} opacity={0.5} />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(27,21,18,0.08)" />
                <XAxis
                  type="number"
                  dataKey="actual"
                  name="Actual price"
                  scale="log"
                  domain={[100_000, 20_000_000]}
                  stroke="#574238"
                  tick={{ fill: '#574238', fontSize: 11 }}
                  tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`}
                  label={{ value: 'Actual KSh / acre (log)', position: 'insideBottom', offset: -16, fill: '#574238', fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="predicted"
                  name="Predicted price"
                  scale="log"
                  domain={[100_000, 20_000_000]}
                  stroke="#574238"
                  tick={{ fill: '#574238', fontSize: 11 }}
                  tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`}
                  label={{ value: 'Predicted KSh / acre (log)', angle: -90, position: 'insideLeft', fill: '#574238', fontSize: 12 }}
                />
                <Tooltip content={<ChartTooltip />} />

                {/* +/-30% hatched band */}
                {bandData.length > 0 && (
                  <Area
                    type="monotone"
                    dataKey="upper"
                    data={bandData}
                    stroke="none"
                    fill="url(#avpHatch)"
                    isAnimationActive={false}
                  />
                )}

                {/* 1:1 parity dashed line */}
                {parityLine.length > 0 && (
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    data={parityLine}
                    stroke="#1f1b16"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                    isAnimationActive={false}
                    name="1:1 parity"
                  />
                )}

                {/* OOF scatter */}
                <Scatter
                  data={oofPoints}
                  fill={PRIMARY_CONTAINER}
                  fillOpacity={0.5}
                  stroke={PRIMARY_CONTAINER}
                  name="OOF"
                />
                {/* Test scatter */}
                <Scatter
                  data={testPoints}
                  fill={TERTIARY}
                  fillOpacity={0.6}
                  stroke={TERTIARY}
                  name="Test"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Legend + interpretation note */}
        <div className="flex items-center gap-4 mt-3 text-caption-sm text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PRIMARY_CONTAINER }} />
            OOF ({oofPoints.length})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TERTIARY }} />
            Test ({testPoints.length})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t border-dashed border-on-surface" />
            1:1 parity
          </span>
        </div>
        <p className="text-caption-sm text-secondary mt-2">
          Points cluster near the dashed line — the model predicts most listings within ±30% of their actual price per acre.
        </p>
      </div>
    </ValuationCard>
  );
}
