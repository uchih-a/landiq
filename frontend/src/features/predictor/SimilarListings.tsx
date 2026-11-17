/**
 * SimilarListings — comparable listings list (Cell 9.6's
 * `listings_scored.parquet` within 50 km of the predicted point).
 *
 * Per row: title (or location fallback), size, distance, listed price/acre,
 * predicted price/acre, verdict chip.
 *
 * IMPORTANT: the backend deliberately OMITS `list_date` / `days_ago` from
 * `ComparableListingResponse` (see `app/schemas/predict.py` docstring —
 * Notebook 1's `list_date` is empty for every listing, so fabricating a
 * value would mislead the user). We therefore render NO "days ago" field
 * here, mirroring the backend's deliberate omission.
 */
import { useTranslation } from 'react-i18next';

import { ValuationCard } from '@/components/ValuationCard';
import { ValuationChip, type Verdict } from '@/components/ValuationChip';
import { formatMoney } from '@/lib/currency/format';
import type { ComparableListing } from '@/lib/api/types';

interface SimilarListingsProps {
  comparables: ComparableListing[];
}

function toVerdict(v: string): Verdict {
  const lower = v.toLowerCase();
  if (lower === 'underpriced') return 'underpriced';
  if (lower === 'overpriced') return 'overpriced';
  if (lower === 'fair') return 'fair';
  return 'constrained';
}

function titleOrFallback(c: ComparableListing): string {
  if (c.title && c.title.trim().length > 0) return c.title;
  if (c.location && c.location.trim().length > 0) return c.location;
  if (c.county && c.county.trim().length > 0) return c.county;
  return 'Untitled listing';
}

export function SimilarListings({ comparables }: SimilarListingsProps) {
  const { t } = useTranslation();

  return (
    <ValuationCard>
      <h3 className="font-outfit text-headline-section text-on-surface mb-4">
        {t('predictor.similarListings')}
      </h3>
      <ul className="flex flex-col gap-1 max-h-96 overflow-y-auto pr-1">
        {comparables.length === 0 ? (
          <li className="text-caption-sm text-secondary py-2">No similar listings within range.</li>
        ) : (
          comparables.map((c, i) => (
            <li
              key={(c.listing_no ?? `cmp-${i}`) + i}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-black/[0.04] last:border-0"
            >
              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <span className="text-body-medium font-body-medium text-on-surface truncate">
                  {titleOrFallback(c)}
                </span>
                <span className="text-caption-sm text-secondary">
                  {c.size_acres} acres · {c.distance_km.toFixed(1)} km away
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <span className="text-body-medium font-body-medium text-on-surface">
                  {formatMoney(c.listed_price_per_acre_ksh)}
                </span>
                <span className="text-caption-sm text-secondary">
                  pred. {formatMoney(c.predicted_price_per_acre_ksh)}
                </span>
              </div>
              <ValuationChip verdict={toVerdict(c.verdict)} />
            </li>
          ))
        )}
      </ul>
    </ValuationCard>
  );
}
