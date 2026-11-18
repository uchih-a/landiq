/**
 * PredictResult — the result panel for the Predictor screen.
 *
 * P2b real-data wiring:
 *  - Every number in the result copy is templated from the response
 *    (confidence_level, coverage.nearby_listings, coverage.county_listings,
 *    coverage.radius_km, coverage.min_county_n, coverage.min_nearby_n).
 *    No typed "80% range" wording — built from response.confidence_level.
 *  - The amber warning colour uses the `market-caution` design token
 *    (already in tailwind.config.ts as `#E3A008`).  No inline hex.
 *  - The "Title Documentation" disabled input is REMOVED from the
 *    unsupported state — it was frontend-only, never wired to the
 *    backend, and collected data that was discarded.  The unsupported
 *    state is now just the diagnostic card + footnote.
 *  - Distinct error states: 429 (rate-limit with retry-after), 422
 *    (validation — shows the backend's message), 503
 *    DATA_UNAVAILABLE, network failure.  Every error has a retry that
 *    re-submits the same request.
 *  - All user-visible strings go through i18n (en + sw).
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
 *     → RateLimitError   : amber "please wait Ns" banner (retryAfterSeconds
 *                          from the 429 response header)
 *     → ApiError 422     : validation error card with the backend's message
 *     → ApiError 503     : DATA_UNAVAILABLE card
 *     → any other Error  : generic EmptyState with Retry button
 *
 *   data (successful response)
 *     Three sub-states keyed on `response.coverage.is_low_support` and
 *     `nearby_listings` (see `deriveResultState` in predictor-helpers.ts):
 *
 *       reliable    → full result panel (StatusBadge reliable + KPI block
 *                     + drivers + nearby + similar)
 *       limited     → amber warning banner ABOVE the same result panel
 *                     (StatusBadge limited)
 *       unsupported → diagnostic card (coverage data only, no price)
 */
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { KpiStatBlock } from '@/components/KpiStatBlock';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { ValuationCard } from '@/components/ValuationCard';
import { ApiError, RateLimitError } from '@/lib/api/error';
import { formatMoney } from '@/lib/currency/format';
import type { CoverageWarning, PredictResponse } from '@/lib/api/types';

import { DriversList } from '@/components/DriversList';
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
        <ValuationCard className="bg-market-caution/10 border border-market-caution/30">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[24px] text-market-caution flex-shrink-0" aria-hidden="true">
              hourglass_top
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-body-medium font-body-medium text-on-surface">
                {t('predictor.tooManyRequests')}
              </span>
              <span className="text-caption-sm text-secondary">
                {t('predictor.retryAfter', { n: error.retryAfterSeconds })}
              </span>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 self-start text-caption-sm font-medium text-primary hover:underline"
              >
                {t('common.retry')}
              </button>
            </div>
          </div>
        </ValuationCard>
      );
    }
    if (error instanceof ApiError) {
      // 422 validation: show the backend's message + the allowed list.
      // 503 DATA_UNAVAILABLE: model not loaded.
      // Other codes: generic retry.
      const isValidation = error.code === 'VALIDATION_ERROR';
      const isDataUnavailable = error.code === 'DATA_UNAVAILABLE';
      return (
        <EmptyState
          icon={isDataUnavailable ? 'cloud_off' : 'error'}
          title={isValidation ? t('predictor.parcelSizeNotNumber') : t('common.error')}
          message={error.message || t('common.error')}
          actionLabel={t('common.retry')}
          onAction={onRetry}
        />
      );
    }
    // Network failure / unknown.
    return (
      <EmptyState
        icon="cloud_off"
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
        title={t('predictor.idleTitle')}
        message={t('predictor.idleMessage')}
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
  // The confidence pct comes from the RESPONSE — never typed "80".
  const confidencePct = Math.round(data.confidence_level * 100);

  // ---- Confidence interval percentage range (asymmetric) ----
  // Computed from the actual interval bounds, not visually approximated:
  //   low_pct  = (low  - estimate) / estimate × 100  (always ≤ 0)
  //   high_pct = (high - estimate) / estimate × 100  (always ≥ 0)
  const est = data.price_per_acre_ksh;
  const low = data.price_per_acre_low_ksh;
  const high = data.price_per_acre_high_ksh;
  const lowPct = est > 0 ? Math.round(((low - est) / est) * 100) : 0;
  const highPct = est > 0 ? Math.round(((high - est) / est) * 100) : 0;
  // Median position within the Low–High range (0–100%), for the bar marker.
  const medianPos = high > low ? Math.max(0, Math.min(100, ((est - low) / (high - low)) * 100)) : 50;
  const rangeLabel = t('predictor.rangeLabel', { lowPct, highPct });

  // Limited state uses the market-caution token for the median pill;
  // reliable uses primary-container.  No inline hex.
  const medianPillBg = isLimited ? 'bg-market-caution/10' : 'bg-primary-container/10';
  const medianPillText = isLimited ? 'text-on-surface' : 'text-primary-container';
  const medianIconColor = isLimited ? 'text-market-caution' : 'text-primary-container';

  return (
    <div className="flex flex-col gap-6">
      {/* Limited-data amber banner — templated from coverage.nearby_listings. */}
      {isLimited && (
        <div
          className="flex items-start gap-3 rounded-xl bg-market-caution/10 p-3 text-on-surface text-caption-sm font-caption-sm"
          role="status"
        >
          <span className="material-symbols-outlined text-[20px] text-market-caution flex-shrink-0" aria-hidden="true">
            warning
          </span>
          <span>
            {t('predictor.sparseCluster', { n: data.coverage.nearby_listings })}
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
              {t('predictor.perAcre')}
            </span>
          </div>
          <p className="font-title-card text-title-card text-secondary mt-1">
            {formatMoney(data.total_price_ksh)}{' '}
            {t(data.total_price_ksh > 0 ? 'predictor.totalParcel' : 'predictor.total')}
            {isLimited ? ` ${t('predictor.indicative')}` : ''}
          </p>
        </div>

        {/* ---- Confidence interval bar ---- */}
        <div className="p-4 rounded-2xl bg-surface-container-low mb-5">
          <div className="flex items-center justify-between text-label-metric font-label-metric mb-2.5">
            <span className="text-secondary">
              {t('predictor.lowLabel')} <strong className="text-on-surface font-medium">{formatMoney(low)}</strong>
            </span>
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${medianPillBg} ${medianPillText} text-caption-sm font-caption-sm`}>
              <span className={`material-symbols-outlined text-[14px] ${medianIconColor}`} aria-hidden="true">
                my_location
              </span>
              <span>{t('predictor.medianLabel')} {formatMoney(est)}</span>
            </div>
            <span className="text-secondary">
              {t('predictor.highLabel')} <strong className="text-on-surface font-medium">{formatMoney(high)}</strong>
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
              aria-hidden="true"
            >
              <div className="w-5 h-5 rounded-full bg-primary-container ring-4 ring-white shadow-md flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-caption-sm font-caption-sm text-secondary mt-2">
            <span>{t('predictor.confidenceInterval', { pct: confidencePct })}</span>
            <span>
              {t('predictor.derivedFromListings', {
                n: data.coverage.nearby_listings,
                radius: data.coverage.radius_km,
              })}
            </span>
          </div>
        </div>

        {/* ---- Secondary stats ---- */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-black/[0.06]">
          <KpiStatBlock
            value={`${confidencePct}%`}
            label={t('predictor.confidenceLevel')}
            context={data.county ? t('predictor.countyLabel', { county: data.county }) : undefined}
            mobile
          />
          <KpiStatBlock
            value={`${data.coverage.nearby_listings}`}
            label={t('predictor.listingsNearby')}
            context={t('predictor.inCounty', { n: data.coverage.county_listings })}
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
            <span className="text-caption-sm font-caption-sm text-secondary">
              {t('predictor.effectCompared')}
            </span>
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
 * P2b: every number in the copy is templated from the response's
 * coverage block (min_county_n, min_nearby_n, county_listings,
 * nearby_listings, radius_km).  No typed thresholds.
 *
 * The disabled Title Documentation field is REMOVED — it was
 * frontend-only, never wired to the backend, and collected data that
 * was discarded.  The unsupported state is now just the diagnostic
 * card + footnote.
 */
function UnsupportedPanel({
  coverage,
  county,
}: {
  coverage: CoverageWarning;
  county: string | null;
}) {
  const { t } = useTranslation();
  const countyName = county ?? t('predictor.unsupportedThisCounty');

  return (
    <div className="flex flex-col gap-4">
      <ValuationCard noPadding className="relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-64 h-64 rounded-full bg-surface-container-high/60 pointer-events-none blur-2xl" aria-hidden="true" />
        <div className="p-space-lg flex flex-col items-start gap-5 relative z-10">
          <div className="flex items-center justify-between w-full">
            <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[26px]" aria-hidden="true">query_stats</span>
            </div>
            <span className="px-3.5 py-1 rounded-full bg-surface-container text-secondary font-label-uppercase text-label-uppercase tracking-wider">
              {t('predictor.unsupported')}
            </span>
          </div>
          <div className="flex flex-col gap-2 max-w-xl">
            <h3 className="font-headline-section text-headline-section text-on-surface">
              {t('predictor.unsupportedHeadline')}
            </h3>
            <p className="font-body-regular text-body-regular text-secondary">
              {t('predictor.unsupportedBody', {
                minCounty: coverage.min_county_n,
                minNearby: coverage.min_nearby_n,
                radius: coverage.radius_km,
                county: countyName,
                countyListings: coverage.county_listings,
                nearby: coverage.nearby_listings,
              })}
            </p>
          </div>
          {/* Diagnostic footnote — templated from coverage. */}
          <div className="w-full pt-4 mt-2 bg-surface-container-lowest/60 rounded-DEFAULT p-3.5 flex items-center justify-between flex-wrap gap-2 text-secondary font-caption-sm text-caption-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-outline" aria-hidden="true">radar</span>
              <span className="text-[12px]">
                {t('predictor.searchRadius', {
                  radius: coverage.radius_km,
                  countyListings: coverage.county_listings,
                })}
              </span>
            </div>
          </div>
        </div>
      </ValuationCard>
    </div>
  );
}
