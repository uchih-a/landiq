/**
 * CountyHexViz — the "Listings by county" honeycomb visualization.
 *
 * Top 6 counties (by listing count, from `useCountyRowCounts()`) are
 * rendered as F1 `HoneycombBadge` hex tiles in a horizontal row, each
 * sized by listing count via CSS `transform: scale()` and colored by
 * rank tier — matching 01_overview/code.html's SVG honeycomb color
 * scheme:
 *
 *   Rank 1 (highest): bg-primary #9D4400, white text
 *   Rank 2:           bg-primary-container #E8742A, white text
 *   Rank 3:           bg-primary-fixed-dim #FFB68F, dark text
 *   Rank 4-6:         bg-outline-variant #DEC1B3, dark text (decreasing opacity)
 *
 * G1 fix: the previous scale formula was INVERTED — it assigned
 * MAX_SCALE to the lowest count and MIN_SCALE to the highest, so the
 * biggest-count county rendered as the smallest hex. Corrected to:
 * `MIN_SCALE + ((MAX_SCALE - MIN_SCALE) * (count - min) / span)` so the
 * highest count gets the largest hex (matching the "hex scaled to listing
 * count" subtitle).
 */
import { useMemo } from 'react';

import { ValuationCard } from '@/components/ValuationCard';
import { HoneycombBadge } from '@/components/HoneycombBadge';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { CountyRowCountsResponse } from '@/lib/api/types';

interface CountyHexVizProps {
  rowCounts: CountyRowCountsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
}

interface TopCounty {
  county: string;
  n_listings: number;
  tier: string;
  scale: number;
  bgClass: string;
  textClass: string;
}

const TOP_N = 6;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.4;
/** Fixed layout cell — bigger than the largest scaled badge so tiles
 *  never overlap regardless of the per-county scale factor. */
const CELL_PX = 80;

/**
 * Tier-based color mapping matching 01_overview/code.html's SVG honeycomb.
 * Rank 1 = darkest orange (Nairobi #9d4400), descending to soft sand
 * (#dec1b3 outline-variant) for lower ranks.
 */
const TIER_STYLES: Record<number, { bgClass: string; textClass: string }> = {
  1: { bgClass: 'bg-primary', textClass: 'text-on-primary' },           // #9D4400
  2: { bgClass: 'bg-primary-container', textClass: 'text-on-primary' }, // #E8742A
  3: { bgClass: 'bg-primary-fixed-dim', textClass: 'text-[#7A3208]' },  // #FFB68F
  4: { bgClass: 'bg-outline-variant', textClass: 'text-[#7A3208]' },    // #DEC1B3
  5: { bgClass: 'bg-outline-variant', textClass: 'text-[#7A3208]' },    // #DEC1B3
  6: { bgClass: 'bg-outline-variant', textClass: 'text-[#7A3208]' },    // #DEC1B3
};

function tierLabel(rank: number): string {
  return `T${rank}`;
}

/**
 * Pick the top-N counties by listing count and assign each a CSS scale
 * factor interpolated linearly between MIN_SCALE and MAX_SCALE across
 * the rank range (so #1 is largest, #N is smallest). Counties with zero
 * listings are dropped before ranking.
 *
 * G1 fix: the formula was inverted. Now: highest count → MAX_SCALE,
 * lowest count → MIN_SCALE.
 */
function buildTopCounties(
  rowCounts: CountyRowCountsResponse | undefined,
): TopCounty[] {
  if (!rowCounts?.counties) return [];
  const sorted = [...rowCounts.counties]
    .filter((c) => c.n_listings > 0)
    .sort((a, b) => b.n_listings - a.n_listings)
    .slice(0, TOP_N);
  if (sorted.length === 0) return [];
  const max = sorted[0].n_listings;
  const min = sorted[sorted.length - 1].n_listings;
  const span = Math.max(1, max - min);
  return sorted.map((c, i) => {
    const rank = i + 1;
    const tierStyle = TIER_STYLES[rank] ?? TIER_STYLES[6];
    return {
      county: c.county,
      n_listings: c.n_listings,
      tier: tierLabel(rank),
      // CORRECTED: highest count → MAX_SCALE, lowest → MIN_SCALE
      scale:
        sorted.length === 1
          ? MAX_SCALE
          : MIN_SCALE + ((MAX_SCALE - MIN_SCALE) * (c.n_listings - min)) / span,
      bgClass: tierStyle.bgClass,
      textClass: tierStyle.textClass,
    };
  });
}

export function CountyHexViz({ rowCounts, isLoading, isError, onRetry }: CountyHexVizProps) {
  const top = useMemo(() => buildTopCounties(rowCounts), [rowCounts]);

  return (
    <ValuationCard noPadding className="lg:col-span-12">
      <div className="p-space-lg">
        <div className="mb-space-md">
          <h2 className="font-headline-section text-headline-section text-on-surface">
            Listings by county
          </h2>
          <p className="text-caption-sm font-caption-sm text-on-surface-variant mt-1">
            Top {TOP_N} counties by sample size · hex scaled to listing count
          </p>
        </div>

        {isLoading ? (
          <div className="flex gap-4 flex-wrap">
            {Array.from({ length: TOP_N }).map((_, i) => (
              <LoadingSkeleton
                key={i}
                className="h-24 w-32 rounded-md"
              />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title="Couldn't load counties"
            message="The county row-counts feed is unavailable right now."
            actionLabel="Retry"
            onAction={() => onRetry?.()}
          />
        ) : top.length === 0 ? (
          <EmptyState
            icon="map"
            title="No county data yet"
            message="Once listings are loaded, the top counties will appear here as scaled hex tiles."
          />
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-2 gap-y-space-md"
            role="list"
            aria-label="Top counties by listing count"
          >
            {top.map((c) => (
              <div
                key={c.county}
                role="listitem"
                className="flex flex-col items-center text-center gap-2"
              >
                {/* Fixed-size cell so the transform: scale below doesn't
                    bleed into neighbouring tiles. */}
                <div
                  className="flex items-center justify-center"
                  style={{ height: CELL_PX, width: CELL_PX }}
                >
                  <div
                    style={{
                      transform: `scale(${c.scale.toFixed(3)})`,
                      transformOrigin: 'center center',
                    }}
                  >
                    <HoneycombBadge bgClass={c.bgClass} textClass={c.textClass}>
                      {c.tier}
                    </HoneycombBadge>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-body-medium font-body-medium text-on-surface leading-tight">
                    {c.county}
                  </span>
                  <span className="text-caption-sm font-caption-sm text-on-surface-variant tabular-nums">
                    {c.n_listings.toLocaleString('en-KE')} listings
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ValuationCard>
  );
}
