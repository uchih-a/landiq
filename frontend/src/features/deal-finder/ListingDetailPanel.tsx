/**
 * ListingDetailPanel — the row-detail panel that renders when a Deal Finder
 * row is selected.
 *
 * P4 fidelity pass: added "Active Target Deal" eyebrow label per design,
 * improved the 80% range visualizer styling, and made the "Open original
 * listing" button dark (bg-[#1F1511]) per the design.
 *
 * Shows:
 *  - "Active Target Deal" eyebrow pill
 *  - Title + verdict chip with percentage
 *  - Location line with near_me icon
 *  - Asking Price vs Model Estimate blocks (side-by-side)
 *  - "Model 80% Range Visualizer" — a track with the 80% band shaded,
 *    a model median marker, and an asking-price marker
 *  - "Open original listing" dark button (only if listing_url is present)
 *
 * Design elements NOT built (reported in known-gaps.md):
 *  - "Top 3 Price Drivers" — the scored-listings endpoint does not return
 *    per-listing SHAP drivers. Would need a separate per-listing SHAP
 *    endpoint (known-gap #23).
 *  - "Model Transparency note" — static text that could be added, but the
 *    design's specific wording references "drivers" which don't exist.
 */
import { ValuationCard } from '@/components';
import type { ListingsScoredRow } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency/format';

interface Props {
  listing: ListingsScoredRow;
  onClose: () => void;
}

function verdictPct(row: ListingsScoredRow): number {
  if (row.predicted_price_per_acre_ksh <= 0) return 0;
  return Math.round(
    ((row.listed_price_per_acre_ksh - row.predicted_price_per_acre_ksh) /
      row.predicted_price_per_acre_ksh) *
      100,
  );
}

function verdictChipClass(verdict: string): string {
  const v = (verdict ?? '').toLowerCase();
  if (v === 'underpriced') return 'bg-[#E8F5E9] text-[#2D6A4F]';
  if (v === 'overpriced') return 'bg-[#FBEBE8] text-[#C84B31]';
  return 'bg-surface-container text-[#5C5752]';
}

export function ListingDetailPanel({ listing, onClose }: Props) {
  const low = listing.low_price_per_acre_ksh;
  const high = listing.high_price_per_acre_ksh;
  const asking = listing.listed_price_per_acre_ksh;
  const predicted = listing.predicted_price_per_acre_ksh;
  const rangeSpan = Math.max(1, high - low);

  const askingPct = Math.max(0, Math.min(100, ((asking - low) / rangeSpan) * 100));
  const predictedPct = Math.max(0, Math.min(100, ((predicted - low) / rangeSpan) * 100));

  const title = listing.title || listing.location || listing.county || listing.listing_no || 'Listing';
  const pct = verdictPct(listing);
  const pctSign = pct >= 0 ? '+' : '';
  const verdictLabel = (listing.verdict ?? '').toLowerCase() === 'underpriced' ? 'Underpriced' :
                       (listing.verdict ?? '').toLowerCase() === 'overpriced' ? 'Overpriced' : 'Fair';
  const total = listing.price_ksh != null ? listing.price_ksh : asking * listing.size_acres;

  return (
    <ValuationCard className="border border-primary-container/20">
      <div className="flex flex-col gap-5">
        {/* Header + verdict badge */}
        <div className="flex items-start justify-between gap-3">
          <div>
            {/* P4: "Active Target Deal" eyebrow per design */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-caption-sm text-caption-sm font-semibold mb-1">
              Active Target Deal
            </div>
            <h3 className="font-headline-section text-headline-section text-on-surface font-semibold leading-snug">
              {title}
            </h3>
            <p className="font-caption-sm text-caption-sm text-secondary flex items-center gap-1 mt-0.5">
              <span className="material-symbols-outlined text-[15px] text-primary">near_me</span>
              {[listing.location, listing.county].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold tracking-tight shrink-0 shadow-xs ${verdictChipClass(listing.verdict)}`}>
              {pctSign}{pct}% {verdictLabel}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail panel"
              className="w-8 h-8 rounded-full hover:bg-surface-container-high text-secondary flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Asking Price vs Model Estimate */}
        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-DEFAULT bg-surface-container-low">
          <div>
            <div className="font-label-uppercase text-label-uppercase text-secondary">Asking Price</div>
            <div className="font-display-kpi-mobile text-display-kpi-mobile text-on-surface font-light tracking-tight mt-0.5">
              {formatMoney(asking)}
            </div>
            <div className="font-caption-sm text-caption-sm text-secondary">
              Total: {formatMoney(total)} ({listing.size_acres} ac)
            </div>
          </div>
          <div className="border-l border-outline-variant/30 pl-3.5">
            <div className="font-label-uppercase text-label-uppercase text-primary font-medium">Model Estimate</div>
            <div className="font-display-kpi-mobile text-display-kpi-mobile text-primary font-light tracking-tight mt-0.5">
              {formatMoney(predicted)}
            </div>
            <div className="font-caption-sm text-caption-sm text-secondary">Median spatial comps</div>
          </div>
        </div>

        {/* 80% Range Visualizer */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-label-metric text-label-metric text-on-surface font-semibold">
              Model 80% Range Visualizer
            </span>
            <span className="font-caption-sm text-caption-sm text-secondary">
              {formatMoney(low)} to {formatMoney(high)} / ac
            </span>
          </div>
          {/* Gauge strip */}
          <div className="relative w-full h-11 bg-surface-container rounded-DEFAULT overflow-hidden p-1 flex items-center">
            {/* Shaded 80% confidence zone */}
            <div className="absolute h-8 bg-primary-fixed/50 rounded-DEFAULT border-l border-r border-primary/40 flex items-center justify-center" style={{ left: '0%', width: '100%' }}>
              <span className="font-caption-sm text-caption-sm text-on-primary-fixed-variant font-medium tracking-wider uppercase opacity-75">
                80% Estimate Range
              </span>
            </div>
            {/* Model median marker */}
            <div
              className="absolute h-9 w-0.5 bg-primary z-10"
              style={{ left: `${predictedPct}%` }}
              title={`Model median estimate: ${formatMoney(predicted)}`}
            >
              <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
            </div>
            {/* Asking price marker */}
            <div
              className="absolute z-20 flex flex-col items-center"
              style={{ left: `${askingPct}%` }}
              title={`Current Asking Price: ${formatMoney(asking)}`}
            >
              <div className="w-3.5 h-3.5 rounded-full bg-[#2D6A4F] ring-2 ring-white shadow-md flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
              <div className="px-1.5 py-0.5 rounded bg-[#1F1511] text-white text-[10px] font-semibold mt-0.5 whitespace-nowrap shadow-xs">
                Asking: {formatMoney(asking).replace(/KES\s*/, '').replace(/KSh\s*/, '')}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-caption-sm text-secondary px-1">
            <span>{formatMoney(low)} / ac</span>
            <span className="text-xs text-[#2D6A4F] font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              Asking price sits {Math.abs(pct)}% {pct < 0 ? 'below' : 'above'} estimated median
            </span>
            <span>{formatMoney(high)} / ac</span>
          </div>
        </div>

        {/* P4: dark "Open original listing" button per design */}
        {listing.listing_url && (
          <a
            href={listing.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#1F1511] text-white font-body-medium text-body-medium font-medium hover:bg-[#2a2520] transition-all shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            Open original listing
          </a>
        )}
      </div>
    </ValuationCard>
  );
}
