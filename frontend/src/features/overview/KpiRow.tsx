/**
 * KpiRow — the KPI stat band at the top of the Overview screen.
 *
 * O2 build round: every value comes from the /overview/summary response
 * (`overview.totals`, `overview.national`) plus /meta (model version +
 * data date) and /model/metrics (the MedAPE typical-error percentage +
 * the 80% interval coverage).  No client-side counting or median
 * computation.
 *
 * Desktop layout (5 tiles, all on canvas — no enclosing card):
 *   1. Total sample        — overview.totals.n_listings
 *   2. Coverage            — overview.national.n_counties_meeting_threshold
 *                            of overview.n_counties_total
 *   3. Median price/ac     — overview.totals.median_price_per_acre_ksh
 *                            + middle-half chip from q1/q3
 *   4. Reliability         — /model/metrics weighted_ensemble row's
 *                            test_MedAPE_pct + interval_coverage_80
 *   5. Model + data date   — /meta.model_version + data_date
 *
 * Mobile layout (hero card + 2x2 grid):
 *   - Hero card: national median per acre with the All-Kenya/county pill
 *     + middle-half chip.
 *   - 2x2 grid: sample, coverage, typical error, range holds.
 *   - The date tile is omitted on mobile per the design.
 */
import { useTranslation } from 'react-i18next';

import type {
  MetaResponse,
  MetricsResponse,
  OverviewSummaryResponse,
} from '@/lib/api/types';
import { formatCompactMoney, formatMoney } from '@/lib/currency/format';

import { formatDateShort } from './overview-helpers';

interface KpiRowProps {
  overview: OverviewSummaryResponse | undefined;
  meta: MetaResponse | null | undefined;
  metrics: MetricsResponse | null | undefined;
  isLoading: boolean;
}

export function KpiRow({ overview, meta, metrics, isLoading }: KpiRowProps) {
  const { t } = useTranslation();

  if (isLoading || !overview) {
    return (
      <section
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6 xl:gap-8 pt-3"
        aria-busy="true"
        aria-label={t('common.loading')}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5 animate-pulse">
            <div className="h-5 w-24 rounded-full bg-surface-container-highest" />
            <div className="h-12 w-32 rounded-lg bg-surface-container-highest" />
            <div className="h-4 w-40 rounded-full bg-surface-container-highest" />
          </div>
        ))}
      </section>
    );
  }

  // ---- Derived values (each guarded for null) ----
  const totals = overview.totals;
  const national = overview.national;
  const nCountiesTotal = overview.n_counties_total;
  const nMeeting = national.n_counties_meeting_threshold;
  const coveragePct =
    nCountiesTotal > 0 ? Math.round((nMeeting / nCountiesTotal) * 100) : 0;

  const median = totals.median_price_per_acre_ksh;
  const q1 = totals.q1_price_per_acre_ksh;
  const q3 = totals.q3_price_per_acre_ksh;

  // Pull the weighted_ensemble row out of /model/metrics for the
  // typical-error percentage + the 80% interval coverage.  Falls back
  // to nulls when the metrics endpoint hasn't loaded or the row is
  // missing the optional coverage fields.
  const ensembleRow = metrics?.table?.rows?.find(
    (r) => r.model === 'weighted_ensemble',
  );
  const typicalErrPct = ensembleRow?.test_MedAPE_pct;
  const intervalCoverage80 = ensembleRow?.interval_coverage_80;

  const dataDate = meta?.data_date;
  const modelVersion = meta?.model_version;

  // ---- Tiles (shared between desktop + mobile) ----
  const sampleTile = (
    <KpiTile
      chip={t('overview.totalSample')}
      value={String(totals.n_listings)}
      caption={`${totals.n_listings} ${t('overview.listingsAnalysed')}`}
    />
  );
  const coverageTile = (
    <KpiTile
      chip={`${t('overview.coverage')} ${coveragePct}%`}
      value={`${nMeeting} `}
      valueSuffix={
        <span className="text-headline-section font-headline-section text-secondary font-light">
          {t('overview.countiesWithData', {
            defaultValue: 'of {{total}}',
            total: nCountiesTotal,
          })}
        </span>
      }
      caption={t('overview.coverageCaption', {
        n: nMeeting,
        total: nCountiesTotal,
        pct: coveragePct,
      })}
    />
  );
  const medianTile = (
    <KpiTile
      chip={
        q1 != null && q3 != null
          ? `${t('overview.middleHalf')} ${formatCompactMoney(q1)} – ${formatCompactMoney(q3)}`
          : t('overview.nationalMedian')
      }
      value={median != null ? formatCompactMoney(median) : '—'}
      caption={
        median != null
          ? `${t('overview.nationalMedian')} ${formatMoney(median)} ${t('common.kshPerAcre')}`
          : t('overview.emptySelection')
      }
    />
  );
  const reliabilityTile = (
    <KpiTile
      chip={t('overview.reliability')}
      value={typicalErrPct != null ? `${typicalErrPct.toFixed(0)}%` : '—'}
      caption={
        typicalErrPct != null && intervalCoverage80 != null
          ? t('overview.reliabilityCaption', {
              pct: typicalErrPct.toFixed(0),
              hold: Math.round(intervalCoverage80 * 100),
            })
          : t('overview.typicalModelError')
      }
    />
  );
  const dateTile = (
    <KpiTile
      chip={modelVersion ?? t('overview.lastUpdated')}
      value={formatDateShort(dataDate)}
      caption={t('overview.dataUpdated', { date: formatDateShort(dataDate) })}
      nowrap
    />
  );

  return (
    <>
      {/* ---- Desktop: 5 tiles in a row ---- */}
      <section
        className="hidden md:grid grid-cols-3 xl:grid-cols-5 gap-6 xl:gap-8 pt-3"
        aria-label="Key figures"
      >
        {sampleTile}
        {coverageTile}
        {medianTile}
        {reliabilityTile}
        {dateTile}
      </section>

      {/* ---- Mobile: hero card + 2x2 grid (no date tile) ---- */}
      <section className="md:hidden flex flex-col gap-3" aria-label="Key figures">
        <div className="rounded-3xl bg-surface-container-lowest p-5 shadow-sm relative overflow-hidden">
          <div
            className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-primary/5 pointer-events-none blur-xl"
            aria-hidden="true"
          />
          <div className="flex items-center justify-between">
            <span className="font-label-metric text-[13px] text-secondary uppercase tracking-wider">
              {t('overview.heroCardLabel')}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-surface-container text-secondary text-[12px] font-medium">
              {t('overview.allKenya')}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-outfit text-display-kpi-mobile text-on-surface font-light leading-none tracking-tight">
              {median != null ? formatCompactMoney(median) : '—'}
            </span>
          </div>
          {q1 != null && q3 != null && (
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/40 text-on-secondary-fixed-variant text-[12px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
                {t('overview.middleHalf')} {formatCompactMoney(q1)} – {formatCompactMoney(q3)}
              </span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {sampleTile}
          {coverageTile}
          {reliabilityTile}
          <KpiTile
            chip={t('overview.rangeHolds')}
            value={
              intervalCoverage80 != null
                ? `${Math.round(intervalCoverage80 * 100)}%`
                : '—'
            }
            caption={t('overview.rangeHolds')}
            nowrap
          />
        </div>
      </section>
    </>
  );
}

// ---- Single tile ----

interface KpiTileProps {
  chip: string;
  value: string;
  valueSuffix?: React.ReactNode;
  caption: string;
  /** When true, the tile's value never wraps. */
  nowrap?: boolean;
}

function KpiTile({ chip, value, valueSuffix, caption, nowrap }: KpiTileProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary text-xs font-medium truncate">
          {chip}
        </span>
      </div>
      <div
        className={`font-outfit text-display-kpi text-on-surface font-light tracking-tight ${
          nowrap ? 'whitespace-nowrap' : ''
        }`}
      >
        {value}
        {valueSuffix}
      </div>
      <p className="text-xs font-label-metric text-secondary line-clamp-2">{caption}</p>
    </div>
  );
}
