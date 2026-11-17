/**
 * ErrorBySupportBars — "Error by listings nearby" chart.
 *
 * P5 wiring (known-gaps #49 RESOLVED). Data comes from
 * `GET /api/v1/model/error-by-support` — the backend returns
 * error_by_support.csv (Cell 9.9) with two groups:
 *  - county_listings: error by county listing count bands
 *  - nearby_within_50km: error by nearby-listing count bands
 *
 * We display the `nearby_within_50km` group (5 buckets) as horizontal
 * bars showing OOF MAE (log-scale, converted to a percentage for
 * readability). The sparse bucket (<5 listings) uses the P1 diagonal-hatch
 * pattern to indicate low-confidence territory.
 */
import { useMemo } from 'react';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import type { ApiQueryResult } from '@/lib/api/hooks';
import type { ErrorBySupportResponse, ErrorBySupportRow } from '@/lib/api/types';

interface Props {
  query: ApiQueryResult<ErrorBySupportResponse>;
}

const HATCH_STROKE = '#dec1b3';
const BAR_COLOR = '#e8742a';

interface Bucket {
  band: string;
  n_listings: number;
  mae_pct: number; // MAE as a percentage of the median (for readability)
  isSparse: boolean;
}

/** Convert log-scale MAE to a rough percentage of typical price. */
function maeToPct(logMae: number): number {
  // exp(logMae) is the absolute error in log space; converting to a
  // percentage of typical price: (exp(mae) - 1) × 100 gives the relative
  // error. For small log errors this approximates the log value × 100.
  return Math.round((Math.exp(logMae) - 1) * 100);
}

export function ErrorBySupportBars({ query }: Props) {
  const { data, isLoading, isError, refetch } = query;

  const buckets: Bucket[] = useMemo(() => {
    if (!data?.rows) return [];
    // Filter to the nearby_within_50km measure (the design shows 5 buckets)
    const nearby = data.rows.filter((r) => r.support_measure === 'nearby_within_50km');
    return nearby.map((r: ErrorBySupportRow) => ({
      band: r.band,
      n_listings: r.n_listings,
      mae_pct: maeToPct(r.oof_mae),
      // Sparse = <5 listings nearby (the first bucket)
      isSparse: r.band.includes('<5') || r.band.includes('< 5'),
    }));
  }, [data]);

  const maxMae = Math.max(1, ...buckets.map((b) => b.mae_pct));

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          Error by listings nearby
        </h2>
        <p className="font-body-regular text-secondary mt-0.5">
          How prediction error varies with the number of nearby listings used as support.
        </p>

        <div className="mt-space-md">
          {isLoading ? (
            <LoadingSkeleton className="h-48 w-full rounded-md" />
          ) : isError ? (
            <EmptyState
              icon="cloud_off"
              title="Couldn't load error data"
              message="The error-by-support feed is unavailable."
              actionLabel="Retry"
              onAction={() => refetch()}
            />
          ) : buckets.length === 0 ? (
            <EmptyState
              icon="bar_chart"
              title="No error data"
              message="No error-by-support data available."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {buckets.map((b) => (
                <div key={b.band} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-on-surface font-medium">{b.band}</span>
                    <span className="text-secondary tabular-nums">
                      {b.n_listings.toLocaleString('en-KE')} listings · ±{b.mae_pct}% error
                    </span>
                  </div>
                  <div className="relative h-4 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    {/* Sparse bucket: hatched fill. Normal: solid orange fill. */}
                    {b.isSparse ? (
                      <div
                        className="absolute left-0 top-0 bottom-0 rounded-full"
                        style={{
                          width: `${(b.mae_pct / maxMae) * 100}%`,
                          backgroundImage: `repeating-linear-gradient(45deg, ${HATCH_STROKE}, ${HATCH_STROKE} 1.25px, transparent 1.25px, transparent 8px)`,
                          opacity: 0.7,
                        }}
                      />
                    ) : (
                      <div
                        className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-300"
                        style={{ width: `${(b.mae_pct / maxMae) * 100}%`, backgroundColor: BAR_COLOR }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-caption-sm text-secondary mt-3">
          Error decreases as nearby listing density increases. Hatched bars indicate sparse support where error estimates are less reliable.
        </p>
      </div>
    </ValuationCard>
  );
}
