/**
 * CoverageDonut — the "How much is explained" card.
 *
 * A Recharts PieChart (donut) showing the share of the ensemble's price
 * attribution that SHAP covers.  P6b: the backend now serves the block
 * normalised to FRACTIONS in [0, 1] with a `source` flag
 * ("recomputed" — computed from the loaded model — or "manifest" — the
 * training-time report).  This card renders EXACTLY what it gets:
 *
 *  - Slice values are the served fractions — never rescaled, never
 *    renormalised, no unit guessing.
 *  - Slice NAMES come from the response: the display names of
 *    `explained_members` / `unexplained_members` (resolved via the
 *    payload's `models` list).  When the members are null (manifest
 *    path) the slices use wording that doesn't claim specific members.
 *  - If the shares are missing, or do NOT sum to ~1 within
 *    SHARES_SUM_TOLERANCE, the card shows an honest "not available"
 *    state instead of silently fixing the numbers.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import type { ExplainabilityModel } from '@/lib/api/types';
import { chartColorForFamily } from '@/lib/ui/chart-tokens';
import { parseCoverage } from './helpers';

interface Props {
  coverage: unknown;
  models: ExplainabilityModel[] | undefined;
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

/**
 * UI constant: how far the two served shares may be from summing to 1
 * before the card declares the coverage data invalid (they are
 * renormalised weights, so a healthy payload sums to 1 within float
 * rounding).  Defined ONCE here — tolerance for rounding, not a data
 * fact about the model.
 */
const SHARES_SUM_TOLERANCE = 0.005;

function memberNames(
  members: string[] | null,
  models: ExplainabilityModel[] | undefined,
): string | null {
  if (!members || members.length === 0) return null;
  const names = members.map((key) => {
    const m = models?.find((x) => x.key === key);
    return m?.display_name ?? key;
  });
  return names.join(' + ');
}

function familyOf(
  members: string[] | null,
  models: ExplainabilityModel[] | undefined,
): string | null {
  if (!members || members.length === 0) return null;
  const first = models?.find((x) => x.key === members[0]);
  return first?.family ?? null;
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
      <div className="text-body-medium font-body-medium text-on-surface">{p.name}</div>
      <div className="text-caption-sm text-on-surface-variant">{p.pct}</div>
    </div>
  );
}

type CoverageState =
  | { kind: 'empty'; parsed: ReturnType<typeof parseCoverage> }
  | { kind: 'invalid'; parsed: ReturnType<typeof parseCoverage> }
  | { kind: 'partial'; parsed: ReturnType<typeof parseCoverage> }
  | { kind: 'ready'; parsed: ReturnType<typeof parseCoverage> };

export function CoverageDonut({ coverage, models, isLoading, isError, onRetry }: Props) {
  const { t } = useTranslation();

  const state = useMemo<CoverageState>(() => {
    const parsed = parseCoverage(coverage);
    const { treeShare, tabnetShare } = parsed;
    if (treeShare == null && tabnetShare == null) return { kind: 'empty', parsed };
    if (treeShare == null || tabnetShare == null) {
      // One share present, one missing — partial data, cannot chart honestly.
      return { kind: 'partial', parsed };
    }
    const sum = treeShare + tabnetShare;
    if (Math.abs(sum - 1) > SHARES_SUM_TOLERANCE) {
      return { kind: 'invalid', parsed };
    }
    return { kind: 'ready', parsed };
  }, [coverage]);

  const data = useMemo<Slice[] | null>(() => {
    if (state.kind !== 'ready') return null;
    const { treeShare, tabnetShare, explainedMembers, unexplainedMembers } = state.parsed;
    const explainedNames = memberNames(explainedMembers, models);
    const unexplainedNames = memberNames(unexplainedMembers, models);
    return [
      {
        name: explainedNames
          ? t('explain.coverageExplained', { members: explainedNames })
          : t('explain.coverageExplainedNoMembers'),
        value: treeShare as number,
        pct: `${Math.round((treeShare as number) * 100)}%`,
        color: chartColorForFamily(familyOf(explainedMembers, models)),
      },
      {
        name: unexplainedNames
          ? t('explain.coverageUnexplained', { members: unexplainedNames })
          : t('explain.coverageUnexplainedNoMembers'),
        value: tabnetShare as number,
        pct: `${Math.round((tabnetShare as number) * 100)}%`,
        color: // Muted colour for the not-covered slice when its family is
          // unknown — a UI colour choice, not a claim about the member.
          chartColorForFamily(familyOf(unexplainedMembers, models) ?? 'neural'),
      },
    ];
  }, [state, models, t]);

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
        title={t('explain.coverageLoadFailed')}
        message={t('explain.feedUnavailable')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }
  if (state.kind === 'empty') {
    return (
      <EmptyState
        icon="pie_chart"
        title={t('explain.coverageEmptyTitle')}
        message={t('explain.coverageEmptyMessage')}
      />
    );
  }
  if (state.kind === 'partial') {
    return (
      <EmptyState
        icon="pie_chart"
        title={t('explain.coverageInvalidTitle')}
        message={t('explain.coverageEmptyMessage')}
      />
    );
  }
  if (state.kind === 'invalid') {
    // Shares that do not sum to ~1 are reported, never renormalised.
    return (
      <EmptyState
        icon="pie_chart"
        title={t('explain.coverageInvalidTitle')}
        message={t('explain.coverageInvalidMessage')}
      />
    );
  }
  if (!data) return null;

  const sourceCaption =
    state.parsed.source === 'recomputed'
      ? t('explain.coverageSource.recomputed')
      : state.parsed.source === 'manifest'
        ? t('explain.coverageSource.manifest')
        : null;

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('explain.howMuchExplained')}
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {t('explain.coverageSubtitle')}
        </p>
        <div
          className="mt-space-md h-56 w-full"
          role="img"
          aria-label={t('explain.coverageA11yName')}
        >
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
        {/* Labels are visible next to each colour — colour is never the
            only encoding. */}
        <div className="mt-space-md flex flex-wrap items-center justify-center gap-4">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: d.color }}
                aria-hidden="true"
              />
              <span className="text-caption-sm text-on-surface-variant">
                {d.name} · {d.pct}
              </span>
            </div>
          ))}
        </div>
        {/* Hidden text summary of the shares for screen readers. */}
        <div className="sr-only">
          <ul>
            {data.map((d) => (
              <li key={d.name}>
                {d.name}: {d.pct}
              </li>
            ))}
          </ul>
        </div>
        {sourceCaption && (
          <p className="mt-space-md text-caption-sm text-secondary">{sourceCaption}</p>
        )}
      </div>
    </ValuationCard>
  );
}
