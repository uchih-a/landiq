/**
 * KpiRow — the 5-up KPI stat band at the top of the Overview screen.
 *
 * Per 01_overview/code.html, the KPI blocks sit DIRECTLY ON THE CANVAS
 * (no enclosing ValuationCard) — they are plain `<div class="flex flex-col
 * gap-1.5">` blocks with a badge pill, a display-kpi numeral, and a
 * label-metric caption. G1 fix: removed the ValuationCard wrappers that
 * F3 added (which gave each KPI a card elevation + border the design
 * doesn't have).
 *
 * The five values are derived from independent backend hooks:
 *
 *  1. Total sample      -> useCountyRowCounts().total_listings
 *  2. Coverage          -> useCountyRowCounts().n_counties + "/ 47"
 *  3. National median   -> median of useCountySummary().counties[].median_price_per_acre_ksh
 *  4. Reliability       -> useModelMetrics() weighted_ensemble row's test_MedAPE_pct
 *  5. Last updated      -> useMeta().data_date
 *
 * Badge text follows the design's contextual style (e.g. "Coverage 49%",
 * "Ensemble model v1") rather than generic labels.
 *
 * The row is a responsive 2 / 3 / 5 column grid (mobile / tablet / desktop).
 */
import { KpiStatBlock, LoadingSkeleton } from '@/components';
import type {
  CountyRowCountsResponse,
  CountySummaryResponse,
  MetaResponse,
  MetricsResponse,
} from '@/lib/api/types';
import { formatCompactKSh, formatDateShort, median } from './overview-helpers';

interface KpiRowProps {
  rowCounts: CountyRowCountsResponse | undefined;
  summary: CountySummaryResponse | undefined;
  metrics: MetricsResponse | undefined;
  meta: MetaResponse | undefined;
  isLoading: boolean;
}

/**
 * Pull the `weighted_ensemble` row out of the metrics table — the backend
 * emits one row per (run, model) and the ensemble row is keyed by
 * `model === 'weighted_ensemble'`. Falls back to the highest-weight row
 * if the name convention ever drifts.
 */
function pickEnsembleRow(metrics: MetricsResponse | undefined) {
  if (!metrics) return undefined;
  const rows = metrics.table.rows;
  return (
    rows.find((r) => r.model === 'weighted_ensemble') ??
    rows.find((r) => r.model.toLowerCase().includes('ensemble')) ??
    [...rows].sort((a, b) => (b.ensemble_weight ?? 0) - (a.ensemble_weight ?? 0))[0]
  );
}

export function KpiRow({ rowCounts, summary, metrics, meta, isLoading }: KpiRowProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 xl:gap-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <LoadingSkeleton className="h-5 w-28 rounded-full" />
            <LoadingSkeleton className="h-12 w-32" />
            <LoadingSkeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const totalSample = rowCounts?.total_listings ?? 0;
  const coverageCount = rowCounts?.n_counties ?? 0;
  const coveragePct = Math.round((coverageCount / 47) * 100);
  const nationalMedian = summary ? median(summary.counties.map((c) => c.median_price_per_acre_ksh)) : null;
  const ensembleRow = pickEnsembleRow(metrics);
  const reliabilityPct =
    ensembleRow && Number.isFinite(ensembleRow.test_MedAPE_pct)
      ? Math.round(ensembleRow.test_MedAPE_pct)
      : null;
  const dataDate = meta?.data_date ?? null;

  return (
    // Design: `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6 xl:gap-8`
    // — NO card wrappers, KPIs directly on canvas.
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 xl:gap-8 pt-3">
      <KpiStatBlock
        badge="Total sample"
        value={totalSample.toLocaleString('en-KE')}
        label="Listings analysed"
        context={`${coverageCount} counties with data`}
      />
      <KpiStatBlock
        badge={`Coverage ${coveragePct}%`}
        value={`${coverageCount} / 47`}
        label="Counties with data"
        context={`${coveragePct}% national coverage`}
      />
      <KpiStatBlock
        badge="National median"
        value={nationalMedian != null ? formatCompactKSh(nationalMedian) : '—'}
        label="Median KSh per acre"
        context="Median of county medians"
      />
      <KpiStatBlock
        badge="Reliability"
        value={reliabilityPct != null ? `${reliabilityPct}%` : '—'}
        label="Typical model error"
        context="Weighted ensemble · MedAPE"
      />
      <KpiStatBlock
        badge={meta?.model_version ?? 'Ensemble model v1'}
        value={formatDateShort(dataDate)}
        label="Data snapshot"
        context="Last data refresh"
      />
    </div>
  );
}
