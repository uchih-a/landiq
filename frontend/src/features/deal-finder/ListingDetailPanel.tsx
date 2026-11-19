/**
 * ListingDetailPanel — the row-detail panel for a selected Deal Finder row
 * (P4b real-data round).
 *
 * P4b change (problem J): the predicted-range visualizer no longer
 * silently clamps the asking price into 0-100% of the band (Math.max(1,
 * high - low) + clamping hid the exact case the card exists for — the
 * asking price OUTSIDE the predicted range, which IS the deal signal).
 * Now:
 *  - The asking marker may fall outside the shaded band: an
 *    out-of-range arrow + "asking is X% above/below the range" computed
 *    from the row's own low/high values.
 *  - Missing or degenerate (equal) low/high renders an honest
 *    "range not available" state instead of a fake full-width band.
 *  - All strings via i18n; money via the currency-aware formatter.
 */
import { useTranslation } from 'react-i18next';

import { ValuationCard } from '@/components';
import type { ListingsScoredRow } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency/format';

import { SUSPECT_STYLE, VERDICT_STYLES, suspectReasonLabelKey } from './verdict-styles';
import { useLocale } from '@/lib/i18n/useLocale';

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

function verdictShortKey(verdict: string): string {
  const v = (verdict ?? '').toLowerCase();
  if (v === 'underpriced') return 'deals.verdictShort.under';
  if (v === 'overpriced') return 'deals.verdictShort.over';
  return 'deals.verdictShort.fair';
}

export function ListingDetailPanel({ listing, onClose }: Props) {
  const { t } = useTranslation();
  const locale = useLocale();

  const low = listing.low_price_per_acre_ksh;
  const high = listing.high_price_per_acre_ksh;
  const asking = listing.listed_price_per_acre_ksh;
  const predicted = listing.predicted_price_per_acre_ksh;

  // P4b: an honest degenerate-range check — missing or equal low/high
  // renders "range not available" instead of a fake band.
  const rangeUsable =
    low != null &&
    high != null &&
    Number.isFinite(low) &&
    Number.isFinite(high) &&
    high > low &&
    low > 0;

  // Positions WITHOUT clamping to the band: extend the track's domain so
  // an out-of-range asking price still renders proportionally outside the
  // shaded band (the exact deal signal), with a floor/ceiling of one
  // track-width beyond either end.
  const domain = rangeUsable
    ? {
        lo: Math.min(low, asking, predicted),
        hi: Math.max(high, asking, predicted),
        span: Math.max(high, asking, predicted) - Math.min(low, asking, predicted) || 1,
      }
    : null;
  const posOf = (v: number) => (domain ? ((v - domain.lo) / domain.span) * 100 : 50);
  // The shaded band's own left/width within the extended domain.
  const bandLeft = domain ? posOf(low) : 0;
  const bandWidth = domain ? posOf(high) - posOf(low) : 100;

  // Out-of-range text: "asking is X% above/below the range" computed from
  // the row's own values (the deal signal the old clamp hid).
  const abovePct =
    rangeUsable && asking > high
      ? Math.round(((asking - high) / high) * 100)
      : null;
  const belowPct =
    rangeUsable && asking < low
      ? Math.round(((low - asking) / low) * 100)
      : null;

  const title =
    listing.title || listing.location || listing.county || listing.listing_no || t('deals.untitled');
  const pct = verdictPct(listing);
  const pctSign = pct >= 0 ? '+' : '';
  const vStyle = VERDICT_STYLES[(listing.verdict ?? '').toLowerCase()] ?? VERDICT_STYLES['fair'];
  const total = listing.price_ksh != null ? listing.price_ksh : asking * listing.size_acres;

  return (
    <ValuationCard className="border border-primary-container/20">
      <div className="flex flex-col gap-5">
        {/* Header + verdict badge */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-caption-sm text-caption-sm font-semibold mb-1">
              {t('deals.activeTargetDeal')}
            </div>
            <h3 className="font-headline-section text-headline-section text-on-surface font-semibold leading-snug">
              {title}
            </h3>
            <p className="font-caption-sm text-caption-sm text-secondary flex items-center gap-1 mt-0.5">
              <span className="material-symbols-outlined text-[15px] text-primary" aria-hidden="true">
                near_me
              </span>
              {[listing.location, listing.county].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {listing.is_suspect ? (
              // Part B: suspect rows show a grey "Suspect data" chip (tooltip
              // = reason) instead of the verdict chip, and "—" instead of %.
              <span
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold tracking-tight shrink-0 shadow-xs ${SUSPECT_STYLE.chip}`}
                title={t('deals.suspectChipTitle', {
                  reason: t(suspectReasonLabelKey(listing.suspect_reason)),
                })}
              >
                {t('deals.suspectData')}
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold tracking-tight shrink-0 shadow-xs ${vStyle.chip}`}
              >
                {pctSign}
                {pct}% {t(verdictShortKey(listing.verdict))}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('deals.closePanel')}
              className="w-8 h-8 rounded-full hover:bg-surface-container-high text-secondary flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
            </button>
          </div>
        </div>

        {/* Asking Price vs Model Estimate */}
        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-DEFAULT bg-surface-container-low">
          <div>
            <div className="font-label-uppercase text-label-uppercase text-secondary">
              {t('deals.askingPrice')}
            </div>
            <div className="font-display-kpi-mobile text-display-kpi-mobile text-on-surface font-light tracking-tight mt-0.5">
              {formatMoney(asking)}
            </div>
            <div className="font-caption-sm text-caption-sm text-secondary">
              {t('deals.totalLine', {
                n: formatMoney(total),
                acres: listing.size_acres.toLocaleString(locale),
              })}
            </div>
          </div>
          <div className="border-l border-outline-variant/30 pl-3.5">
            <div className="font-label-uppercase text-label-uppercase text-primary font-medium">
              {t('deals.modelEstimate')}
            </div>
            <div className="font-display-kpi-mobile text-display-kpi-mobile text-primary font-light tracking-tight mt-0.5">
              {formatMoney(predicted)}
            </div>
            <div className="font-caption-sm text-caption-sm text-secondary">
              {t('deals.medianSpatialComps')}
            </div>
          </div>
        </div>

        {/* Predicted-range visualizer (P4b: no clamping — the asking
            marker may fall outside the band; degenerate ranges render an
            honest "not available" state). */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-label-metric text-label-metric text-on-surface font-semibold">
              {t('deals.rangeVisualizer')}
            </span>
            {rangeUsable ? (
              <span className="font-caption-sm text-caption-sm text-secondary">
                {t('deals.rangeLine', {
                  low: formatMoney(low),
                  high: formatMoney(high),
                })}
              </span>
            ) : null}
          </div>

          {rangeUsable && domain ? (
            <>
              {/* Gauge strip — extended domain so out-of-range still shows. */}
              <div className="relative w-full h-11 bg-surface-container rounded-DEFAULT overflow-hidden p-1 flex items-center">
                {/* Shaded predicted-interval zone (the band within the domain). */}
                <div
                  className="absolute h-8 bg-primary-fixed/50 rounded-DEFAULT border-l border-r border-primary/40 flex items-center justify-center"
                  style={{ left: `${bandLeft}%`, width: `${Math.max(bandWidth, 0)}%` }}
                >
                  <span className="font-caption-sm text-caption-sm text-on-primary-fixed-variant font-medium tracking-wider uppercase opacity-75">
                    {t('deals.estimateRangeLabel')}
                  </span>
                </div>
                {/* Model median marker */}
                <div
                  className="absolute h-9 w-0.5 bg-primary z-10"
                  style={{ left: `${posOf(predicted)}%` }}
                  title={t('deals.modelMedianTitle', { n: formatMoney(predicted) })}
                >
                  <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
                </div>
                {/* Asking marker — may fall OUTSIDE the band (the deal
                    signal). Out-of-range arrows flank the track. */}
                {asking < low && (
                  <span
                    className="absolute left-1 top-1/2 -translate-y-1/2 z-20 material-symbols-outlined text-[16px] text-market-overvalued"
                    aria-hidden="true"
                    title={t('deals.belowRangeTitle')}
                  >
                    arrow_back
                  </span>
                )}
                {asking > high && (
                  <span
                    className="absolute right-1 top-1/2 -translate-y-1/2 z-20 material-symbols-outlined text-[16px] text-market-overvalued"
                    aria-hidden="true"
                    title={t('deals.aboveRangeTitle')}
                  >
                    arrow_forward
                  </span>
                )}
                <div
                  className="absolute z-20 flex flex-col items-center"
                  style={{ left: `${Math.max(2, Math.min(98, posOf(asking)))}%` }}
                  title={t('deals.askingTitle', { n: formatMoney(asking) })}
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-[#2D6A4F] ring-2 ring-white shadow-md flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <div className="px-1.5 py-0.5 rounded bg-[#1F1511] text-white text-[10px] font-semibold mt-0.5 whitespace-nowrap shadow-xs">
                    {t('deals.askingLabel', {
                      n: formatMoney(asking).replace(/KES\s*/, '').replace(/KSh\s*/, ''),
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-caption-sm text-secondary px-1">
                <span>{formatMoney(low)} / ac</span>
                {/* Out-of-range sentence — the deal signal the old clamp hid.
                    Part B: suspect rows show "—" instead (the signal is
                    unreliable when listed/predicted is implausible). */}
                {listing.is_suspect ? (
                  <span className="text-xs text-secondary font-semibold">
                    {t('deals.suspectPlaceholder')}
                  </span>
                ) : abovePct != null ? (
                  <span className="text-xs text-[#C84B31] font-semibold flex items-center gap-1" role="status">
                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                      trending_up
                    </span>
                    {t('deals.aboveRange', { pct: abovePct })}
                  </span>
                ) : belowPct != null ? (
                  <span className="text-xs text-[#2D6A4F] font-semibold flex items-center gap-1" role="status">
                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                      trending_down
                    </span>
                    {t('deals.belowRange', { pct: belowPct })}
                  </span>
                ) : (
                  <span className="text-xs text-[#2D6A4F] font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                      check_circle
                    </span>
                    {t('deals.withinRange', { pct: Math.abs(pct) })}
                  </span>
                )}
                <span>{formatMoney(high)} / ac</span>
              </div>
            </>
          ) : (
            <p className="text-caption-sm text-secondary italic py-3 text-center">
              {t('deals.rangeNotAvailable')}
            </p>
          )}
        </div>

        {/* Dark "Open original listing" button */}
        {listing.listing_url && (
          <a
            href={listing.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#1F1511] text-white font-body-medium text-body-medium font-medium hover:bg-[#2a2520] transition-all shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              open_in_new
            </span>
            {t('deals.openOriginal')}
          </a>
        )}
      </div>
    </ValuationCard>
  );
}
