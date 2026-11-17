/**
 * PredictResult — the result panel for the Predictor screen.
 *
 * Renders the right-hand panel based on the `usePredict()` mutation state:
 *
 *   idle (no data, no error, not pending)
 *     → EmptyState "Estimate a price" prompt
 *
 *   isPending (mutation in-flight)
 *     → LoadingSkeleton stack (form stays interactive — only this panel
 *       shows the skeleton, per spec)
 *
 *   error
 *     → RateLimitError   : amber "please wait before trying again" banner
 *                          with retryAfterSeconds
 *     → any other Error  : EmptyState with Retry button
 *
 *   data (successful response)
 *     Three sub-states keyed on `response.coverage.is_low_support` and
 *     `county_listings` (see `deriveResultState` in predictor-helpers.ts):
 *
 *       reliable    → full result panel (StatusBadge reliable + KPI block
 *                     + drivers + nearby + similar)
 *       limited     → amber warning banner ABOVE the same result panel
 *                     (StatusBadge limited)
 *       unsupported → EmptyState ("we don't have enough listings here")
 *                     + a Title Documentation field
 *
 * Title Documentation is a frontend-only field not yet wired to the backend.
 * The PredictRequest schema only accepts lat, lon, size_acres, prop_type,
 * parcel_features, confidence_level — there is no slot for it. The field
 * exists on the unsupported state purely as a UI affordance for the user
 * to flag the parcel for manual review; its value is NOT sent anywhere.
 */
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { KpiStatBlock } from '@/components/KpiStatBlock';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { ValuationCard } from '@/components/ValuationCard';
import { RateLimitError } from '@/lib/api/error';
import { formatMoney } from '@/lib/currency/format';
import type { CoverageWarning, PredictResponse } from '@/lib/api/types';

import { DriversList } from './DriversList';
import { NearbyInfrastructure } from './NearbyInfrastructure';
import { SimilarListings } from './SimilarListings';
import { deriveResultState } from './predictor-helpers';

interface PredictResultProps {
  isPending: boolean;
  error: Error | null;
  data: PredictResponse | undefined;
  onRetry: () => void;
}

export function PredictResult({ isPending, error, data, onRetry }: PredictResultProps) {
  const { t } = useTranslation();

  // ---- Pending: skeleton on this panel only (form stays interactive). ----
  if (isPending) {
    return (
      <ValuationCard className="flex flex-col gap-4">
        <LoadingSkeleton className="h-6 w-1/3" />
        <LoadingSkeleton className="h-16 w-2/3" />
        <LoadingSkeleton className="h-24 w-full" />
        <LoadingSkeleton className="h-32 w-full" />
        <LoadingSkeleton className="h-24 w-full" />
      </ValuationCard>
    );
  }

  // ---- Error states ----
  if (error) {
    if (error instanceof RateLimitError) {
      return (
        <ValuationCard className="bg-[#E3A008]/10 border-[#E3A008]/30">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[24px] text-market-caution flex-shrink-0">
              hourglass_top
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-body-medium font-body-medium text-on-surface">
                {t('predictor.tooManyRequests')}
              </span>
              <span className="text-caption-sm text-secondary">
                Please wait {error.retryAfterSeconds}s before trying again.
              </span>
            </div>
          </div>
        </ValuationCard>
      );
    }
    return (
      <EmptyState
        icon="error"
        title={t('common.error')}
        message={error.message || t('common.error')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }

  // ---- Idle (no prediction yet) ----
  if (!data) {
    return (
      <EmptyState
        icon="calculate"
        title={t('nav.predictor')}
        message="Search a location, tell us about the parcel, and we'll estimate the price per acre with a confidence range."
      />
    );
  }

  // ---- Success: switch on coverage state. ----
  const state = deriveResultState(data.coverage);

  // Unsupported: not enough listings to produce ANY estimate.
  if (state === 'unsupported') {
    return <UnsupportedPanel coverage={data.coverage} county={data.county} />;
  }

  const isLimited = state === 'limited';
  const confidencePct = Math.round(data.confidence_level * 100);

  // ---- Confidence interval percentage range (asymmetric) ----
  // Per 02_predictor_reliable/code.html design: "about -41% to +75% of the
  // estimate". Computed from the actual interval bounds, not visually
  // approximated:
  //   low_pct  = (low  - estimate) / estimate × 100  (always ≤ 0)
  //   high_pct = (high - estimate) / estimate × 100  (always ≥ 0)
  const est = data.price_per_acre_ksh;
  const low = data.price_per_acre_low_ksh;
  const high = data.price_per_acre_high_ksh;
  const lowPct = est > 0 ? Math.round(((low - est) / est) * 100) : 0;
  const highPct = est > 0 ? Math.round(((high - est) / est) * 100) : 0;
  // Median position within the Low–High range (0–100%), for the bar marker.
  const medianPos = high > low ? Math.max(0, Math.min(100, ((est - low) / (high - low)) * 100)) : 50;
  const rangeLabel = `about ${lowPct}% to +${highPct}% of the estimate`;

  // Limited state uses amber for the median pill; reliable uses orange.
  const medianPillBg = isLimited ? 'bg-[#E3A008]/10' : 'bg-[#E8742A]/10';
  const medianPillText = isLimited ? 'text-on-surface' : 'text-primary-container';
  const medianIconColor = isLimited ? 'text-[#E3A008]' : 'text-primary-container';

  return (
    <div className="flex flex-col gap-6">
      {/* Limited-data amber banner — per 03_predictor_limited_data/code.html:
          "Sparse listing cluster: Only N listings nearby, so this range is wide." */}
      {isLimited && (
        <div className="flex items-start gap-3 rounded-xl bg-[#E3A008]/10 p-3 text-on-surface text-caption-sm font-caption-sm">
          <span className="material-symbols-outlined text-[20px] text-[#E3A008] flex-shrink-0">
            warning
          </span>
          <span>
            <strong>Sparse listing cluster:</strong> Only {data.coverage.nearby_listings} listings nearby, so this range is wide.
          </span>
        </div>
      )}

      {/* ---- Main estimate card ---- */}
      <ValuationCard>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <StatusBadge status={isLimited ? 'limited' : 'reliable'} />
            <span className="text-caption-sm font-caption-sm text-secondary">{rangeLabel}</span>
          </div>
        </div>

        {/* KPI: price per acre + total */}
        <div className="mb-6">
          <div className="flex items-baseline gap-3">
            <span
              className="font-outfit text-display-kpi text-on-surface font-light tracking-tight"
              style={{ opacity: isLimited ? 0.9 : 1 }}
            >
              {formatMoney(data.price_per_acre_ksh)}
            </span>
            <span className="font-headline-section text-headline-section text-secondary font-light">
              / acre
            </span>
          </div>
          <p className="font-title-card text-title-card text-secondary mt-1">
            {formatMoney(data.total_price_ksh)} for {data.total_price_ksh > 0 ? 'total parcel' : 'total'}
            {isLimited && ' (indicative)'}
          </p>
        </div>

        {/* ---- Confidence interval bar (per 02_predictor_reliable design) ----
            Low <KSh> · Median <KSh> pill · High <KSh>, with a gradient bar
            and a position marker dot showing where the estimate sits within
            the Low–High range. */}
        <div className="p-4 rounded-2xl bg-surface-container-low mb-5">
          <div className="flex items-center justify-between text-label-metric font-label-metric mb-2.5">
            <span className="text-secondary">
              Low <strong className="text-on-surface font-medium">{formatMoney(low)}</strong>
            </span>
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${medianPillBg} ${medianPillText} text-caption-sm font-caption-sm`}>
              <span className={`material-symbols-outlined text-[14px] ${medianIconColor}`}>my_location</span>
              <span>Median {formatMoney(est)}</span>
            </div>
            <span className="text-secondary">
              High <strong className="text-on-surface font-medium">{formatMoney(high)}</strong>
            </span>
          </div>
          <div className="relative py-2">
            <div className="h-3 w-full rounded-full bg-surface-container-highest overflow-hidden relative">
              <div className="h-full bg-gradient-to-r from-surface-variant via-primary-fixed-dim to-primary-container rounded-full w-full" />
            </div>
            {/* Median position marker */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${medianPos}%` }}
            >
              <div className="w-5 h-5 rounded-full bg-primary-container ring-4 ring-white shadow-md flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-caption-sm font-caption-sm text-secondary mt-2">
            <span>{confidencePct}% confidence interval</span>
            <span>Derived from {data.coverage.nearby_listings} localized listings within {data.coverage.radius_km} km</span>
          </div>
        </div>

        {/* ---- Secondary stats ---- */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-black/[0.06]">
          <KpiStatBlock
            value={`${confidencePct}%`}
            label="Confidence level"
            context={data.county ? `County: ${data.county}` : undefined}
            mobile
          />
          <KpiStatBlock
            value={`${data.coverage.nearby_listings}`}
            label="Listings nearby"
            context={`${data.coverage.county_listings} in county`}
            mobile
          />
        </div>
      </ValuationCard>

      {/* ---- What drives this price ---- */}
      {data.explanation && data.explanation.drivers.length > 0 && (
        <ValuationCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-outfit text-headline-section text-on-surface">
              {t('predictor.whatDrivesPrice')}
            </h3>
            <span className="text-caption-sm font-caption-sm text-secondary">Effect compared with a typical listing</span>
          </div>
          <DriversList drivers={data.explanation.drivers} />
        </ValuationCard>
      )}

      {/* ---- Nearby & Infrastructure ---- */}
      <NearbyInfrastructure diagnostics={data.diagnostics} namedPois={data.named_pois} />

      {/* ---- Similar listings ---- */}
      <SimilarListings comparables={data.comparables} />
    </div>
  );
}

/**
 * UnsupportedPanel — the "we don't have enough listings here" state.
 *
 * Per 04_predictor_unsupported/code.html, this is a rich card with:
 *  - An icon circle + "Sample Threshold Unmet" pill
 *  - Headline + diagnostic body (using coverage data: min_county_n,
 *    min_nearby_n, county_listings, nearby_listings, radius_km)
 *  - A diagnostic footnote with the search radius + county listing count
 *
 * The disabled Title Documentation field (F10's fix) is kept below the
 * diagnostic card — it is frontend-only and intentionally disabled with a
 * lock note. See the file-level docstring on PredictResult for context.
 */
function UnsupportedPanel({
  coverage,
  county,
}: {
  coverage: CoverageWarning;
  county: string | null;
}) {
  const countyName = county ?? 'this county';

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Insufficient-data diagnostic card (per design) ---- */}
      <ValuationCard noPadding className="relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-64 h-64 rounded-full bg-surface-container-high/60 pointer-events-none blur-2xl" />
        <div className="p-space-lg flex flex-col items-start gap-5 relative z-10">
          <div className="flex items-center justify-between w-full">
            <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[26px]">query_stats</span>
            </div>
            <span className="px-3.5 py-1 rounded-full bg-surface-container text-secondary font-label-uppercase text-label-uppercase tracking-wider">
              Sample Threshold Unmet
            </span>
          </div>
          <div className="flex flex-col gap-2 max-w-xl">
            <h3 className="font-headline-section text-headline-section text-on-surface">
              We don't have enough listings here to estimate a price.
            </h3>
            <p className="font-body-regular text-body-regular text-secondary">
              We need at least {coverage.min_county_n} listings in the county and{' '}
              {coverage.min_nearby_n} within {coverage.radius_km} km.{' '}
              {countyName} has {coverage.county_listings} listing
              {coverage.county_listings !== 1 ? 's' : ''},{' '}
              {coverage.nearby_listings} within {coverage.radius_km} km of this point.
            </p>
          </div>
          {/* Diagnostic footnote */}
          <div className="w-full pt-4 mt-2 bg-surface-container-lowest/60 rounded-DEFAULT p-3.5 flex items-center justify-between flex-wrap gap-2 text-secondary font-caption-sm text-caption-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-outline">radar</span>
              <span className="text-[12px]">
                Search Radius: {coverage.radius_km} km · County listings: {coverage.county_listings}
              </span>
            </div>
          </div>
        </div>
      </ValuationCard>

      {/* Title Documentation is a frontend-only field not yet wired to the
          backend. PredictRequest only accepts lat, lon, size_acres,
          prop_type, parcel_features, confidence_level — no title slot.
          Rendered disabled with a lock note so it's clear the affordance
          exists but is reserved for future use. */}
      <ValuationCard>
        <div className="flex flex-col gap-2">
          <label className="text-label-metric font-label-metric text-secondary" htmlFor="title-doc">
            Title documentation
          </label>
          <p className="text-caption-sm text-secondary">
            Flag this parcel for manual review. Our team will follow up using the title reference you provide.
          </p>
          <input
            id="title-doc"
            type="text"
            disabled
            placeholder="Title number / deed reference"
            className="h-12 w-full rounded-full bg-surface-container-lowest border border-black/[0.06] shadow-[inset_0_1px_2px_rgba(27,21,18,0.03)] text-body-regular text-on-surface placeholder:text-secondary px-5 opacity-60 cursor-not-allowed"
          />
          <p className="text-caption-sm text-secondary mt-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            Not yet supported — this field is for future use.
          </p>
        </div>
      </ValuationCard>
    </div>
  );
}
