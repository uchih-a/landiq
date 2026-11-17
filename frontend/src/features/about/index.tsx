/**
 * About — built to the m13_about mobile design (no web design exists —
 * the desktop layout is a sensible single-column extension).
 *
 * NOTE ON PROVENANCE (fidelity round): authored against a source tree
 * where the first P7 build was NOT present (about/ was still the F0
 * placeholder), so this is the first build shaped directly by m13.
 *
 * Sections in design order:
 *   1. Header — "SYSTEM ARCHITECTURE" eyebrow pill, title, subtitle.
 *      (The design PNG's "M13 About" label is a design-file label and is
 *      deliberately not rendered.)
 *   2. Live system card — status dot (green ok / amber degraded),
 *      version chip + engine title from /meta, sample-size sentence from
 *      /counties/row_counts, three-stat footer (80% range holds / MdAPE /
 *      counties covered — see the copy-audit table in the report for the
 *      one substitution made).
 *   3. Valuation pipeline — 6-step vertical stepper with a connecting
 *      line, design icons, final step highlighted, "6 Steps" chip.
 *   4. Methodology & Questions — 7 accessible accordion rows. Every number
 *      in an answer comes from an API at render time (MdAPE, coverage,
 *      /meta thresholds). Numbers in the design's copy that the backend
 *      cannot confirm were removed rather than kept (see the report).
 *   5. "Report a wrong listing" — a mailto: link to VITE_REPORT_EMAIL;
 *      hidden entirely when that env var is unset.
 *   6. Footer disclaimer — full two-sentence copy from code.html.
 *
 * Desktop: constrained to ~840px centred, same card language.
 */

import { useMemo, useState } from 'react';

import { LoadingSkeleton, ValuationCard } from '@/components';
import {
  useCountyRowCounts,
  useExplainability,
  useHealth,
  useMeta,
  useModelMetrics,
} from '@/lib/api/hooks';
import { pickEnsembleRow } from '@/features/model-performance/metrics-helpers';

/** Configurable report destination. Unset → the button is hidden. */
const REPORT_EMAIL: string | undefined = import.meta.env.VITE_REPORT_EMAIL as string | undefined;

// The design's six steps, with the exact Material Symbol icon names from
// m13's code.html (cloud_sync, filter_alt, pin_drop, model_training,
// calculate, insights).
const PIPELINE_STEPS = [
  {
    icon: 'cloud_sync',
    title: 'Collect listings',
    body: 'Automated ingestion of asking-price listings from public real estate platforms across Kenya.',
  },
  {
    icon: 'filter_alt',
    title: 'Check and clean',
    body: 'Algorithmic filtering for extreme outliers, duplicate listings, and mismatched coordinates.',
  },
  {
    icon: 'pin_drop',
    title: 'Add location features',
    body: 'Geospatial enrichment: distances to Nairobi and county towns, road access, utility proximity, county baseline.',
  },
  {
    icon: 'model_training',
    title: 'Train and compare models',
    body: 'Cross-validation benchmarking of CatBoost, XGBoost, and TabNet against county medians.',
  },
  {
    icon: 'calculate',
    title: 'Combine into an estimate with a range',
    body: 'Ensemble weighting with empirical 80% coverage intervals.',
  },
  {
    icon: 'insights',
    title: 'Show it here',
    body: 'Interactive spatial maps, deal ratings, and factor breakdowns.',
  },
] as const;

interface FaqRow {
  id: string;
  question: string;
  answer: string;
}

export default function About() {
  const healthQ = useHealth();
  const metaQ = useMeta();
  const rowCountsQ = useCountyRowCounts();
  const metricsQ = useModelMetrics();
  const explainQ = useExplainability();

  const ensembleRow = pickEnsembleRow(metricsQ.data);
  const medape = ensembleRow?.test_MedAPE_pct ?? null;
  const coverage80 = ensembleRow?.interval_coverage_80 ?? null;
  const modelVersion = metaQ.data?.model_version ?? null;
  const dataDate = metaQ.data?.data_date ?? null;
  const nUsable = rowCountsQ.data?.total_listings ?? null;
  const minCountyN = metaQ.data?.coverage?.min_county_n ?? null;
  const minNearbyN = metaQ.data?.coverage?.min_nearby_n ?? null;
  const radiusKm = metaQ.data?.coverage?.radius_km ?? null;
  const nCounties = rowCountsQ.data?.n_counties ?? null;
  const isDegraded = healthQ.data?.status === 'degraded' || healthQ.data?.status === undefined;

  // Number-bearing answers are generated at render time from the API so
  // they can never go stale against the design's mock numbers.
  const faq: FaqRow[] = [
    {
      id: 'sources',
      question: 'Data sources',
      answer:
        'Asking prices from public real estate listings collected across the counties the dataset covers. Estimates reflect market sentiment, not official registry transactions.',
    },
    {
      id: 'features',
      question: 'What the model looks at',
      answer:
        'Distance to Nairobi, distance to the county town, road access, utilities proximity, parcel size, and county baseline — the production feature set the explainability tab ranks by impact.',
    },
    {
      id: 'reliability',
      question: 'How reliable is it',
      answer:
        medape != null && coverage80 != null
          ? `Holdout test MdAPE ${Math.round(medape)}%, with an 80% interval that holds ${Math.round(
              coverage80 * 100,
            )}% of the time on verified listings.`
          : 'Reliability figures are unavailable while the metrics feed is down.',
    },
    {
      id: 'refusal',
      question: 'When we will not estimate',
      answer:
        minCountyN != null && minNearbyN != null && radiusKm != null
          ? `Fewer than ${minCountyN} listings in the county, or fewer than ${minNearbyN} within ${radiusKm} km. In sparsely sampled areas the estimate range widens too far to be useful, so the engine stops.`
          : 'When local listing density is too thin for a supportable estimate.',
    },
    {
      id: 'anomalies',
      question: 'How we handle suspicious listings',
      answer:
        'Listings whose price sits outside the dataset\u2019s 1st\u201399th percentile window are flagged (the Notice column in Deal Finder) and excluded from model training.',
    },
    {
      id: 'limits',
      question: 'Limitations',
      answer:
        'Estimates reflect asking market sentiment, not cadastral deeds or formal bank appraisals. Environmental encumbrances or title complexities require physical conveyancing verification.',
    },
    {
      id: 'glossary',
      question: 'Glossary',
      answer: '__GLOSSARY__',
    },
  ];

  return (
    <div className="flex flex-col gap-space-lg p-margin max-w-[840px] mx-auto">
      {/* ---- 1. Header ---- */}
      <header className="flex flex-col pt-2">
        <div className="inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed w-fit shadow-sm">
          <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            verified
          </span>
          <span className="font-label-uppercase text-label-uppercase font-semibold uppercase tracking-wider text-[11px]">
            System Architecture
          </span>
        </div>
        <h1 className="font-headline-page-mobile md:text-headline-page text-on-surface mt-2 font-medium tracking-tight">
          About
        </h1>
        <p className="font-body-regular text-body-regular text-on-surface-variant mt-1 leading-snug">
          Methodology, validation pipeline &amp; system integrity.
        </p>
      </header>

      {/* ---- 2. Live system card ---- */}
      <LiveSystemCard
        isDegraded={isDegraded}
        isLoading={healthQ.isLoading || metaQ.isLoading || metricsQ.isLoading}
        modelVersion={modelVersion}
        dataDate={dataDate}
        nUsable={nUsable}
        medape={medape}
        coverage80={coverage80}
        nCounties={nCounties}
      />

      {/* ---- 3. Valuation pipeline ---- */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-section text-headline-section text-on-surface font-medium tracking-tight">
              Valuation Pipeline
            </h2>
            <span className="font-caption-sm text-caption-sm bg-primary-fixed text-on-primary-fixed font-semibold px-2.5 py-1 rounded-full">
              6 Steps
            </span>
          </div>
          <p className="font-body-regular text-body-regular text-on-surface-variant text-[13px] mt-0.5">
            From raw multi-source ingestion to spatially calibrated estimates.
          </p>
        </div>
        <ValuationCard noPadding>
          <div className="p-space-md">
            <div className="relative flex flex-col gap-6">
              {PIPELINE_STEPS.map((step, i) => {
                const last = i === PIPELINE_STEPS.length - 1;
                return (
                  <div key={step.title} className="relative flex items-start gap-space-md">
                    {/* Connecting line between icon circles (all but last). */}
                    {!last && (
                      <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-outline-variant/30 -mb-6" />
                    )}
                    <div
                      className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
                        last
                          ? 'bg-primary-container text-on-primary shadow-md'
                          : 'bg-primary-fixed text-primary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{step.icon}</span>
                    </div>
                    <div className="flex flex-col min-w-0 pt-0.5">
                      <span className="font-caption-sm text-caption-sm text-primary font-semibold uppercase tracking-wider">
                        Step {String(i + 1).padStart(2, '0')}
                        {last ? ' • Deployment' : ''}
                      </span>
                      <h3 className="font-title-card text-title-card text-on-surface font-semibold leading-snug">
                        {step.title}
                      </h3>
                      <p className="font-body-regular text-body-regular text-on-surface-variant text-[13px] mt-1 leading-relaxed">
                        {step.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ValuationCard>
      </section>

      {/* ---- 4. Methodology & Questions ---- */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col">
          <h2 className="font-headline-section text-headline-section text-on-surface font-medium tracking-tight">
            Methodology &amp; Questions
          </h2>
          <p className="font-body-regular text-body-regular text-on-surface-variant text-[13px] mt-0.5">
            Inspection of model assumptions, empirical rules, and terminology.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          {faq.map((row) => (
            <Accordion
              key={row.id}
              id={`faq-${row.id}`}
              question={row.question}
              answer={row.answer}
              glossary={explainQ}
            />
          ))}
        </div>
      </section>

      {/* ---- 5. Report a wrong listing (only when a destination exists) ---- */}
      {REPORT_EMAIL && (
        <a
          href={`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(
            'Wrong listing report — Kenya Land Valuation',
          )}`}
          className="w-full min-h-[50px] bg-primary text-on-primary rounded-full px-space-lg py-3 flex items-center justify-center gap-space-xs font-body-medium text-body-medium shadow-md hover:bg-on-primary-container active:scale-[0.99] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">flag</span>
          <span>Report a wrong listing</span>
        </a>
      )}

      {/* ---- 6. Footer disclaimer (full copy from code.html) ---- */}
      <footer className="pt-space-xs pb-space-sm text-center flex flex-col items-center justify-center">
        <p className="font-caption-sm text-caption-sm text-on-surface-variant/80 max-w-xs leading-normal">
          Estimates represent automated machine learning projections based on open asking datasets.
        </p>
        <p className="font-caption-sm text-caption-sm text-on-surface-variant/80 max-w-xs leading-normal mt-1">
          Not a certified surveyor appraisal, legal valuation certificate, or formal guarantee.
        </p>
      </footer>
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. Live system card
// ----------------------------------------------------------------------

function LiveSystemCard({
  isDegraded,
  isLoading,
  modelVersion,
  dataDate,
  nUsable,
  medape,
  coverage80,
  nCounties,
}: {
  isDegraded: boolean;
  isLoading: boolean;
  modelVersion: string | null;
  dataDate: string | null;
  nUsable: number | null;
  medape: number | null;
  coverage80: number | null;
  nCounties: number | null;
}) {
  if (isLoading) {
    return (
      <div className="bg-surface-container rounded-lg p-space-md shadow-sm flex flex-col gap-3">
        <LoadingSkeleton className="h-4 w-40" />
        <LoadingSkeleton className="h-6 w-56" />
        <LoadingSkeleton className="h-3 w-72" />
        <LoadingSkeleton className="h-8 w-full" />
      </div>
    );
  }
  return (
    <div className="bg-surface-container rounded-lg p-space-md shadow-sm relative overflow-hidden">
      <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-primary-fixed/30 rounded-full blur-2xl pointer-events-none" />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-space-xs">
          {isDegraded ? (
            <>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-container" />
              <span className="font-caption-sm text-caption-sm text-primary-container font-semibold uppercase tracking-wider">
                System degraded
              </span>
            </>
          ) : (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tertiary" />
              </span>
              <span className="font-caption-sm text-caption-sm text-tertiary font-semibold uppercase tracking-wider">
                Live System Active
              </span>
            </>
          )}
        </div>
        <span className="font-caption-sm text-caption-sm text-on-surface-variant font-medium bg-surface-container-lowest px-2.5 py-0.5 rounded-full shadow-sm">
          {modelVersion ?? 'Version unavailable'}
        </span>
      </div>

      <div className="mt-space-sm flex flex-col gap-1">
        <span className="font-title-card text-title-card text-on-surface font-semibold">
          {modelVersion ?? 'Ensemble engine'}
        </span>
        <p className="font-body-regular text-body-regular text-on-surface-variant text-[13px] leading-relaxed">
          {/* No training-date field exists on /meta, so the recency claim is
              replaced by the real data snapshot date. */}
          {dataDate != null ? `Data as of ${dataDate}` : 'Data date unavailable'}
          {nUsable != null ? ` • ${nUsable.toLocaleString('en-KE')} scored parcels in the active dataset.` : '.'}
        </p>
      </div>

      <div className="mt-space-sm pt-space-xs flex items-center gap-space-md flex-wrap">
        <div className="flex flex-col">
          <span className="font-caption-sm text-caption-sm text-on-surface-variant font-normal">80% range holds</span>
          <span className="font-label-metric text-label-metric text-on-surface font-semibold">
            {coverage80 != null ? `${Math.round(coverage80 * 100)}%` : '—'}
          </span>
        </div>
        <div className="w-px h-6 bg-outline-variant/40" />
        <div className="flex flex-col">
          <span className="font-caption-sm text-caption-sm text-on-surface-variant font-normal">Holdout Error</span>
          <span className="font-label-metric text-label-metric text-primary font-semibold">
            {medape != null ? `MdAPE ${Math.round(medape)}%` : '—'}
          </span>
        </div>
        <div className="w-px h-6 bg-outline-variant/40" />
        {/* The design's "Cadastre Align: Geocoded" is not confirmable by any
            backend field — substituted with the real counties-covered count. */}
        <div className="flex flex-col">
          <span className="font-caption-sm text-caption-sm text-on-surface-variant font-normal">Counties Covered</span>
          <span className="font-label-metric text-label-metric text-tertiary font-semibold">
            {nCounties != null ? `${nCounties} of 47` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 4. Accessible accordion
// ----------------------------------------------------------------------

function Accordion({
  id,
  question,
  answer,
  glossary,
}: {
  id: string;
  question: string;
  answer: string;
  glossary: ReturnType<typeof useExplainability>;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `${id}-panel`;

  // The glossary row renders real terminology; feature entries come from
  // the explainability payload's feature_labels when it is loaded.
  const isGlossary = answer === '__GLOSSARY__';

  const glossaryEntries = useMemo(
    () =>
      (Object.entries(glossary.data?.feature_labels ?? {})
        .filter(([, f]) => f.in_production_set)
        .map(([name, f]) => ({ name, label: f.label, description: f.description }))
        .slice(0, 6)),
    [glossary.data],
  );

  return (
    <div className="bg-surface-container rounded-lg transition-all duration-200 overflow-hidden shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        id={`${id}-button`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="w-full flex items-center justify-between p-space-md text-left min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-container rounded-lg"
      >
        <span className="font-body-medium text-body-medium text-on-surface font-semibold pr-2">{question}</span>
        <span
          className={`material-symbols-outlined text-primary text-[22px] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={`${id}-button`}
          className="px-space-md pb-space-md pt-0 text-on-surface-variant font-body-regular text-[14px] leading-relaxed"
        >
          {isGlossary ? (
            glossary.isLoading ? (
              <LoadingSkeleton className="h-16 w-full rounded-md" />
            ) : glossaryEntries.length === 0 ? (
              <p>Feature terminology is unavailable while the explainability feed is down.</p>
            ) : (
              <div className="space-y-2">
                <div>
                  <strong className="text-on-surface">MdAPE:</strong> Median Absolute Percentage Error —
                  the benchmark deviation metric, resistant to market tail spikes.
                </div>
                <div>
                  <strong className="text-on-surface">SHAP feature impact:</strong> attribution of
                  each spatial factor&rsquo;s positive or negative push on the estimate.
                </div>
                <div>
                  <strong className="text-on-surface">IQR spread:</strong> interquartile range (25th
                  to 75th percentile) tracking core price dispersion.
                </div>
                <div>
                  <strong className="text-on-surface">Confidence interval:</strong> calibrated bounds
                  containing the true price 80% of the time on verified listings.
                </div>
                {glossaryEntries.map((g) => (
                  <div key={g.name}>
                    <strong className="text-on-surface">{g.label}:</strong> {g.description || g.name}
                  </div>
                ))}
              </div>
            )
          ) : (
            answer
          )}
        </div>
      )}
    </div>
  );
}
