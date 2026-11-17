/**
 * CoverageDonut — the F8 "How much is explained" card.
 *
 * A Recharts PieChart (donut) showing the share of the ensemble's price
 * attribution that SHAP covers: tree models vs TabNet. The two slices
 * come from the `ensemble_shap_coverage` block on the explainability
 * payload.
 *
 * These shares are recomputed by the backend from the actually-loaded
 * ensemble — NOT hardcoded from the notebook's static numbers. The
 * backend may emit the values as fractions (0..1) or percentages
 * (0..100); we defensively normalise so both shapes render correctly.
 */
import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';

interface Props {
  coverage: Record<string, unknown> | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

interface Slice {
  name: string;
  value: number;
  pct: string;
  color: string;
}

const TREE_COLOR = '#e8742a';
const TABNET_COLOR = '#6a5b56';

/** Coerce an unknown value to a finite number, or null. */
function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function CoverageTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Slice }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-body-medium font-body-medium text-on-surface">
        {p.name}
      </div>
      <div className="text-caption-sm text-on-surface-variant">{p.pct}</div>
    </div>
  );
}

export function CoverageDonut({ coverage, isLoading, isError, onRetry }: Props) {
  const data = useMemo<Slice[] | null>(() => {
    if (!coverage) return null;
    const treeShare = toNum(coverage.tree_share_explained_by_shap);
    const tabnetShare = toNum(coverage.tabnet_share_not_covered);
    if (treeShare == null && tabnetShare == null) return null;
    // Normalise to fractions — values may be 0..1 or 0..100.
    const tree = (treeShare ?? 0) > 1 ? (treeShare ?? 0) / 100 : (treeShare ?? 0);
    const tabnet =
      (tabnetShare ?? 0) > 1 ? (tabnetShare ?? 0) / 100 : (tabnetShare ?? 0);
    const sum = Math.max(0.0001, tree + tabnet);
    const treePct = Math.round((tree / sum) * 100);
    const tabnetPct = 100 - treePct;
    return [
      { name: 'Tree models (SHAP)', value: tree, pct: `${treePct}%`, color: TREE_COLOR },
      { name: 'TabNet (not covered)', value: tabnet, pct: `${tabnetPct}%`, color: TABNET_COLOR },
    ];
  }, [coverage]);

  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-64 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title="Couldn't load coverage"
        message="The explainability feed is unavailable."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        icon="pie_chart"
        title="No coverage breakdown"
        message="The ensemble SHAP coverage block is missing tree_share / tabnet_share fields."
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          How much is explained
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          Share of the ensemble's price attribution explained by SHAP.
        </p>
        <div className="mt-space-md h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={<CoverageTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-space-md flex flex-wrap items-center justify-center gap-4">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-caption-sm text-on-surface-variant">
                {d.name} · {d.pct}
              </span>
            </div>
          ))}
        </div>
        {/* These shares are recomputed by the backend from the
            actually-loaded ensemble — NOT hardcoded from the notebook's
            static numbers. */}
        <p className="mt-space-md text-caption-sm text-secondary">
          Shares are recomputed by the backend from the actually-loaded ensemble, not the notebook's static numbers.
        </p>
      </div>
    </ValuationCard>
  );
}
