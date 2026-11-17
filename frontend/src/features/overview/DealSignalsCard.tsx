/**
 * DealSignalsCard — narrow (4/12) card on the Overview grid.
 *
 * Per 01_overview/code.html, the deal-signals visualization is NOT a
 * Recharts bar chart — it's a single CSS `rounded-full overflow-hidden`
 * horizontal bar with three percentage-width segments, plus a 3-column
 * grid of mini stat cards below showing the count + percentage for each
 * verdict bucket.
 *
 * G1 fix: replaced the previous Recharts stacked BarChart (which
 * approximated the rounded terminal caps with `radius={[6,0,0,6]}`) with
 * the design's actual CSS div approach. This gives perfect pill caps
 * (`rounded-full` = 9999px) matching the design exactly, and is simpler.
 *
 * Colors updated to match the design's semantic tokens:
 *  - Underpriced: `bg-tertiary` (#006d3b) — design uses `bg-tertiary`
 *  - Fair:        `bg-secondary` (#6a5b56) — design uses `bg-secondary`
 *  - Overpriced:  `bg-error` (#ba1a1a) — design uses `bg-error`
 *
 * Counts come from `useListingsScored()` — we tally each listing's
 * `verdict` field via `computeVerdictCounts()` (in overview-helpers).
 */
import { useMemo } from 'react';

import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { ApiQueryResult } from '@/lib/api/hooks';
import type { ListingsScoredResponse } from '@/lib/api/types';
import { computeVerdictCounts } from './overview-helpers';

interface DealSignalsCardProps {
  query: ApiQueryResult<ListingsScoredResponse>;
  filterLabel: string;
}

interface Bucket {
  key: 'underpriced' | 'fair' | 'overpriced';
  label: string;
  count: number;
  pct: number;
  /** Tailwind bg class for the bar segment + legend dot */
  barClass: string;
  dotClass: string;
  /** Text color class for the mini-card count */
  textClass: string;
}

export function DealSignalsCard({ query, filterLabel }: DealSignalsCardProps) {
  const { data, isLoading, isError, refetch } = query;

  const tally = useMemo(
    () => computeVerdictCounts(data?.listings ?? []),
    [data],
  );

  const totalRendered = tally.underpriced + tally.fair + tally.overpriced;
  const pct = (n: number) =>
    totalRendered > 0 ? (n / totalRendered) * 100 : 0;

  const buckets: Bucket[] = [
    {
      key: 'underpriced',
      label: 'Under',
      count: tally.underpriced,
      pct: pct(tally.underpriced),
      barClass: 'bg-tertiary',
      dotClass: 'bg-tertiary',
      textClass: 'text-tertiary',
    },
    {
      key: 'fair',
      label: 'Fair',
      count: tally.fair,
      pct: pct(tally.fair),
      barClass: 'bg-secondary',
      dotClass: 'bg-secondary',
      textClass: 'text-on-surface',
    },
    {
      key: 'overpriced',
      label: 'Over',
      count: tally.overpriced,
      pct: pct(tally.overpriced),
      barClass: 'bg-error',
      dotClass: 'bg-error',
      textClass: 'text-error',
    },
  ];

  return (
    <ValuationCard className="lg:col-span-4" noPadding>
      <div className="p-space-lg flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-headline-section text-headline-section text-on-surface">
              Deal signals
            </h2>
            <p className="font-body-regular font-body-regular text-secondary mt-0.5">
              Model estimate vs asking price distribution
            </p>
          </div>
        </div>

        {isLoading ? (
          <LoadingSkeleton className="h-24 w-full rounded-md" />
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title="Couldn't load signals"
            message="The scored listings feed is unavailable right now."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : totalRendered === 0 ? (
          <EmptyState
            icon="sentiment_neutral"
            title="No deals to score"
            message="No scored listings match the current filter — try widening it."
          />
        ) : (
          <>
            {/* Single rounded-full bar with percentage-width segments.
                This is the design's actual approach — NOT a Recharts bar.
                `rounded-full overflow-hidden` gives perfect pill terminal
                caps (9999px radius) on both ends automatically. */}
            <div className="w-full h-6 rounded-full overflow-hidden flex bg-surface-container-high shadow-inner">
              {buckets.map((b) => (
                <div
                  key={b.key}
                  className={`h-full ${b.barClass} transition-all duration-500 hover:opacity-90`}
                  style={{ width: `${b.pct}%` }}
                  title={`${b.label}priced: ${b.pct.toFixed(1)}%`}
                />
              ))}
            </div>

            {/* 3-column mini stat cards — one per verdict bucket.
                Each shows the dot + label, the count (in headline-section
                size), and the percentage of sample. */}
            <div className="grid grid-cols-3 gap-2">
              {buckets.map((b) => (
                <div
                  key={b.key}
                  className="flex flex-col gap-1 p-2 rounded-DEFAULT bg-surface-container-low"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${b.dotClass}`} />
                    <span className="text-xs text-secondary font-medium">{b.label}</span>
                  </div>
                  <span className={`font-headline-section text-headline-section ${b.textClass}`}>
                    {b.count.toLocaleString('en-KE')}
                  </span>
                  <span className="text-xs text-secondary">
                    {b.pct.toFixed(1)}% sample
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs text-secondary font-body-regular pt-1">
              Asking price compared with the model estimate range · {filterLabel}
            </p>
          </>
        )}
      </div>
    </ValuationCard>
  );
}
