/**
 * About — built to the m13_about mobile design (no web design exists —
 * the desktop layout is a sensible single-column extension).
 *
 * P8b (data-driven copy; visuals unchanged):
 *  - Every fact in the pipeline copy comes from an API at render time:
 *    the sources note + cleaning steps + feature groups from /meta's
 *    `methodology` block (the backend's ONE canonical copy, maintained
 *    next to the pipeline code), the model names from /model/metrics
 *    `model_info`, and the interval level from `default_interval_level`.
 *    Claims the repo cannot verify (duplicate-listing removal, mismatched
 *    coordinates) were REMOVED, not templated — they live in the
 *    notebook's ETL, which is not part of this repo (reported).
 *  - FAQ answers template MedAPE (one decimal), the interval level, the
 *    coverage, the /meta thresholds, and the flag window from
 *    `flag_definition` — never a typed "80%" or "1st–99th".
 *  - The health card distinguishes loading / ok / degraded / unreachable
 *    (a failed health query is NOT shown as "degraded").
 *  - "Counties Covered" shows "N of TOTAL" where TOTAL is the
 *    boundaries/summary response's `n_counties_total` — never a typed 47.
 *  - All copy renders from i18n (en + sw); "MedAPE" is used app-wide
 *    (the old "MdAPE" inconsistency is gone — one term via i18n).
 *  - The accordion keeps its keyboard-accessible pattern (button +
 *    aria-expanded + aria-controls).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LoadingSkeleton, ValuationCard } from '@/components';
import {
  useCountyRowCounts,
  useCountySummary,
  useExplainability,
  useHealth,
  useMeta,
  useModelMetrics,
} from '@/lib/api/hooks';
import { pickEnsembleRow } from '@/features/model-performance/metrics-helpers';
import { useFormatNumber } from '@/lib/i18n/useLocale';
import { ordinal } from '@/lib/ordinal';

/** Configurable report destination. Unset → the button is hidden. */
const REPORT_EMAIL: string | undefined = import.meta.env.VITE_REPORT_EMAIL as string | undefined;

/** How many feature-label glossary entries render — display density,
 *  not a data fact (the count interpolates into the caption). */
const GLOSSARY_FEATURE_LIMIT = 6;

/** The pipeline's structural steps: icons + i18n title keys are UI
 *  structure; every FACT in the body comes from an API (see the
 *  component: methodology / metrics responses). */
const PIPELINE_STEPS = [
  { icon: 'cloud_sync', titleKey: 'about.step.collect.title', bodyKey: 'about.step.collect.body' },
  { icon: 'filter_alt', titleKey: 'about.step.clean.title', bodyKey: 'about.step.clean.body' },
  { icon: 'pin_drop', titleKey: 'about.step.features.title', bodyKey: 'about.step.features.body' },
  { icon: 'model_training', titleKey: 'about.step.train.title', bodyKey: 'about.step.train.body' },
  { icon: 'calculate', titleKey: 'about.step.combine.title', bodyKey: 'about.step.combine.body' },
  { icon: 'insights', titleKey: 'about.step.show.title', bodyKey: 'about.step.show.body' },
] as const;

type HealthState = 'loading' | 'ok' | 'degraded' | 'unreachable';

export default function About() {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const healthQ = useHealth();
  const metaQ = useMeta();
  const rowCountsQ = useCountyRowCounts();
  const countySummaryQ = useCountySummary();
  const metricsQ = useModelMetrics();
  const explainQ = useExplainability();

  const ensembleRow = pickEnsembleRow(metricsQ.data);
  const medape = ensembleRow?.test_MedAPE_pct ?? null;
  const coverageAtDefault = ensembleRow?.interval_coverage_80 ?? null;
  const modelVersion = metaQ.data?.model_version ?? null;
  const dataDate = metaQ.data?.data_date ?? null;
  const nUsable = rowCountsQ.data?.total_listings ?? null;
  const nCounties = rowCountsQ.data?.n_counties ?? null;
  const nCountiesTotal = countySummaryQ.data?.n_counties_total ?? null;
  const minCountyN = metaQ.data?.coverage?.min_county_n ?? null;
  const minNearbyN = metaQ.data?.coverage?.min_nearby_n ?? null;
  const radiusKm = metaQ.data?.coverage?.radius_km ?? null;
  const methodology = metaQ.data?.methodology ?? null;
  const flagDefinition = metaQ.data?.flag_definition ?? null;
  // The interval level from the response (0.8 → "80" in the copy).
  const intervalLevel = metricsQ.data?.default_interval_level ?? null;
  const intervalLevelPct = intervalLevel != null ? Math.round(intervalLevel * 100) : null;

  // Health: four distinct states — a loading or failed health query is
  // NOT "degraded" (the old `status === undefined` bug).
  const healthState: HealthState = healthQ.isLoading
    ? 'loading'
    : healthQ.isError
      ? 'unreachable'
      : healthQ.data?.status === 'degraded'
        ? 'degraded'
        : healthQ.data?.status === 'ok'
          ? 'ok'
          : 'unreachable';

  // Trained member display names from the metrics response's model_info
  // (tree + neural families only — never a typed "CatBoost, XGBoost, TabNet").
  const trainedModelNames = useMemo(() => {
    const info = metricsQ.data?.model_info ?? {};
    return Object.entries(info)
      .filter(([, m]) => m.family === 'tree' || m.family === 'neural')
      .map(([, m]) => m.display_name);
  }, [metricsQ.data?.model_info]);

  // Methodology block pieces (null-safe joins).
  const sourcesNote = methodology?.sources_note ?? null;
  const cleaningSteps = methodology?.cleaning_steps ?? null;
  const featureGroups = methodology?.feature_groups ?? null;
  const unavailable = t('about.copy.unavailable');

  const stepBodies: Record<(typeof PIPELINE_STEPS)[number]['bodyKey'], string> = {
    'about.step.collect.body': sourcesNote ?? unavailable,
    'about.step.clean.body': cleaningSteps != null ? cleaningSteps.join(' ') : unavailable,
    'about.step.features.body':
      featureGroups != null
        ? t('about.step.features.body', { groups: featureGroups.join(', ') })
        : unavailable,
    'about.step.train.body':
      trainedModelNames.length > 0
        ? t('about.step.train.body', { models: trainedModelNames.join(', ') })
        : t('about.step.train.bodyFallback'),
    'about.step.combine.body':
      intervalLevelPct != null
        ? t('about.step.combine.body', { level: intervalLevelPct })
        : t('about.step.combine.bodyFallback'),
    'about.step.show.body': t('about.step.show.body'),
  };

  const faq = useMemo(
    () => [
      {
        id: 'sources',
        question: t('about.faq.q.sources'),
        answer: sourcesNote ?? unavailable,
      },
      {
        id: 'features',
        question: t('about.faq.q.features'),
        answer:
          featureGroups != null
            ? t('about.faq.a.features', { groups: featureGroups.join(', ') })
            : unavailable,
      },
      {
        id: 'reliability',
        question: t('about.faq.q.reliability'),
        answer:
          medape != null && coverageAtDefault != null && intervalLevelPct != null
            ? t('about.faq.a.reliability', {
                medape: medape.toFixed(1),
                level: intervalLevelPct,
                coverage: Math.round(coverageAtDefault * 100),
              })
            : t('about.faq.a.reliabilityUnavailable'),
      },
      {
        id: 'refusal',
        question: t('about.faq.q.refusal'),
        answer:
          minCountyN != null && minNearbyN != null && radiusKm != null
            ? t('about.faq.a.refusal', {
                county: formatNumber(minCountyN),
                nearby: formatNumber(minNearbyN),
                radius: formatNumber(radiusKm),
              })
            : t('about.faq.a.refusalUnavailable'),
      },
      {
        id: 'anomalies',
        question: t('about.faq.q.anomalies'),
        answer:
          flagDefinition != null
            ? t('about.faq.a.anomalies', {
                lower: ordinal(flagDefinition.lower_pct),
                upper: ordinal(flagDefinition.upper_pct),
              })
            : unavailable,
      },
      {
        id: 'limits',
        question: t('about.faq.q.limits'),
        answer: t('about.faq.a.limits'),
      },
      {
        id: 'glossary',
        question: t('about.faq.q.glossary'),
        answer: '__GLOSSARY__',
      },
    ],
    // The template values are render-time inputs; t is stable per language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      t,
      sourcesNote,
      featureGroups,
      medape,
      coverageAtDefault,
      intervalLevelPct,
      minCountyN,
      minNearbyN,
      radiusKm,
      flagDefinition,
    ],
  );

  return (
    <div className="flex flex-col gap-space-lg p-margin max-w-[840px] mx-auto">
      {/* ---- 1. Header ---- */}
      <header className="flex flex-col pt-2">
        <div className="inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed w-fit shadow-sm">
          <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            verified
          </span>
          <span className="font-label-uppercase text-label-uppercase font-semibold uppercase tracking-wider text-[11px]">
            {t('about.eyebrow')}
          </span>
        </div>
        <h1 className="font-headline-page-mobile md:text-headline-page text-on-surface mt-2 font-medium tracking-tight">
          {t('about.title')}
        </h1>
        <p className="font-body-regular text-body-regular text-on-surface-variant mt-1 leading-snug">
          {t('about.subtitle')}
        </p>
      </header>

      {/* ---- 2. Live system card ---- */}
      <LiveSystemCard
        healthState={healthState}
        isLoading={metaQ.isLoading || metricsQ.isLoading}
        modelVersion={modelVersion}
        dataDate={dataDate}
        nUsable={nUsable}
        medape={medape}
        coverageAtDefault={coverageAtDefault}
        intervalLevelPct={intervalLevelPct}
        nCounties={nCounties}
        nCountiesTotal={nCountiesTotal}
      />

      {/* ---- 3. Valuation pipeline ---- */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-section text-headline-section text-on-surface font-medium tracking-tight">
              {t('about.pipeline.title')}
            </h2>
            <span className="font-caption-sm text-caption-sm bg-primary-fixed text-on-primary-fixed font-semibold px-2.5 py-1 rounded-full">
              {t('about.pipeline.steps', { n: PIPELINE_STEPS.length })}
            </span>
          </div>
          <p className="font-body-regular text-body-regular text-on-surface-variant text-[13px] mt-0.5">
            {t('about.pipeline.subtitle')}
          </p>
        </div>
        <ValuationCard noPadding>
          <div className="p-space-md">
            <div className="relative flex flex-col gap-6">
              {PIPELINE_STEPS.map((step, i) => {
                const last = i === PIPELINE_STEPS.length - 1;
                return (
                  <div key={step.titleKey} className="relative flex items-start gap-space-md">
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
                        {last
                          ? t('about.pipeline.stepLabelFinal', { n: String(i + 1).padStart(2, '0') })
                          : t('about.pipeline.stepLabel', { n: String(i + 1).padStart(2, '0') })}
                      </span>
                      <h3 className="font-title-card text-title-card text-on-surface font-semibold leading-snug">
                        {t(step.titleKey)}
                      </h3>
                      <p className="font-body-regular text-body-regular text-on-surface-variant text-[13px] mt-1 leading-relaxed">
                        {stepBodies[step.bodyKey]}
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
            {t('about.faq.title')}
          </h2>
          <p className="font-body-regular text-body-regular text-on-surface-variant text-[13px] mt-0.5">
            {t('about.faq.subtitle')}
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
              intervalLevelPct={intervalLevelPct}
            />
          ))}
        </div>
      </section>

      {/* ---- 5. Report a wrong listing (only when a destination exists) ---- */}
      {REPORT_EMAIL && (
        <a
          href={`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(t('about.report.subject'))}`}
          className="w-full min-h-[50px] bg-primary text-on-primary rounded-full px-space-lg py-3 flex items-center justify-center gap-space-xs font-body-medium text-body-medium shadow-md hover:bg-on-primary-container active:scale-[0.99] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">flag</span>
          <span>{t('about.report.button')}</span>
        </a>
      )}

      {/* ---- 6. Footer disclaimer ---- */}
      <footer className="pt-space-xs pb-space-sm text-center flex flex-col items-center justify-center">
        <p className="font-caption-sm text-caption-sm text-on-surface-variant/80 max-w-xs leading-normal">
          {t('about.footer.disclaimer1')}
        </p>
        <p className="font-caption-sm text-caption-sm text-on-surface-variant/80 max-w-xs leading-normal mt-1">
          {t('about.footer.disclaimer2')}
        </p>
      </footer>
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. Live system card
// ----------------------------------------------------------------------

function LiveSystemCard({
  healthState,
  isLoading,
  modelVersion,
  dataDate,
  nUsable,
  medape,
  coverageAtDefault,
  intervalLevelPct,
  nCounties,
  nCountiesTotal,
}: {
  healthState: HealthState;
  isLoading: boolean;
  modelVersion: string | null;
  dataDate: string | null;
  nUsable: number | null;
  medape: number | null;
  coverageAtDefault: number | null;
  intervalLevelPct: number | null;
  nCounties: number | null;
  nCountiesTotal: number | null;
}) {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
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
          {healthState === 'ok' && (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tertiary" />
              </span>
              <span className="font-caption-sm text-caption-sm text-tertiary font-semibold uppercase tracking-wider">
                {t('about.live.ok')}
              </span>
            </>
          )}
          {healthState === 'degraded' && (
            <>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-container" />
              <span className="font-caption-sm text-caption-sm text-primary-container font-semibold uppercase tracking-wider">
                {t('about.live.degraded')}
              </span>
            </>
          )}
          {healthState === 'loading' && (
            <>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary/40" />
              <span className="font-caption-sm text-caption-sm text-secondary font-semibold uppercase tracking-wider">
                {t('about.live.loading')}
              </span>
            </>
          )}
          {healthState === 'unreachable' && (
            <>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error/60" />
              <span className="font-caption-sm text-caption-sm text-error font-semibold uppercase tracking-wider">
                {t('about.live.unreachable')}
              </span>
              <span className="font-caption-sm text-caption-sm text-secondary">
                {t('about.live.unreachableNote')}
              </span>
            </>
          )}
        </div>
        <span className="font-caption-sm text-caption-sm text-on-surface-variant font-medium bg-surface-container-lowest px-2.5 py-0.5 rounded-full shadow-sm">
          {modelVersion ?? t('about.live.versionUnavailable')}
        </span>
      </div>

      <div className="mt-space-sm flex flex-col gap-1">
        <span className="font-title-card text-title-card text-on-surface font-semibold">
          {modelVersion ?? t('about.live.engine')}
        </span>
        <p className="font-body-regular text-body-regular text-on-surface-variant text-[13px] leading-relaxed">
          {/* No training-date field exists on /meta, so the recency claim is
              replaced by the real data snapshot date. */}
          {dataDate != null ? t('about.live.dataAsOf', { date: dataDate }) : t('about.live.dataDateUnavailable')}
          {nUsable != null ? ` · ${t('about.live.parcels', { n: formatNumber(nUsable) })}` : ''}
        </p>
      </div>

      <div className="mt-space-sm pt-space-xs flex items-center gap-space-md flex-wrap">
        <div className="flex flex-col">
          <span className="font-caption-sm text-caption-sm text-on-surface-variant font-normal">
            {intervalLevelPct != null
              ? t('about.live.stat.coverage', { level: intervalLevelPct })
              : t('about.live.stat.unavailable')}
          </span>
          <span className="font-label-metric text-label-metric text-on-surface font-semibold">
            {coverageAtDefault != null ? `${Math.round(coverageAtDefault * 100)}%` : t('about.live.stat.unavailable')}
          </span>
        </div>
        <div className="w-px h-6 bg-outline-variant/40" />
        <div className="flex flex-col">
          <span className="font-caption-sm text-caption-sm text-on-surface-variant font-normal">
            {t('about.live.stat.error')}
          </span>
          <span className="font-label-metric text-label-metric text-primary font-semibold">
            {medape != null
              ? t('about.live.stat.medape', { pct: medape.toFixed(1) })
              : t('about.live.stat.unavailable')}
          </span>
        </div>
        <div className="w-px h-6 bg-outline-variant/40" />
        {/* "of TOTAL" comes from the boundaries/summary response — never a
            typed 47. */}
        <div className="flex flex-col">
          <span className="font-caption-sm text-caption-sm text-on-surface-variant font-normal">
            {t('about.live.stat.counties')}
          </span>
          <span className="font-label-metric text-label-metric text-tertiary font-semibold">
            {nCounties != null && nCountiesTotal != null
              ? t('about.live.stat.ofTotal', { n: formatNumber(nCounties), total: formatNumber(nCountiesTotal) })
              : nCounties != null
                ? formatNumber(nCounties)
                : t('about.live.stat.unavailable')}
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
  intervalLevelPct,
}: {
  id: string;
  question: string;
  answer: string;
  glossary: ReturnType<typeof useExplainability>;
  intervalLevelPct: number | null;
}) {
  const { t } = useTranslation();
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
        .slice(0, GLOSSARY_FEATURE_LIMIT)),
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
          aria-hidden="true"
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
              <p>{t('about.glossary.unavailable')}</p>
            ) : (
              <div className="space-y-2">
                {/* One term app-wide via i18n: "MedAPE" (the old "MdAPE"
                    inconsistency is gone). */}
                <div>{t('about.glossary.medape')}</div>
                <div>{t('about.glossary.shap')}</div>
                <div>{t('about.glossary.iqr')}</div>
                <div>
                  {t('about.glossary.interval', {
                    level: intervalLevelPct ?? '',
                  })}
                </div>
                {glossaryEntries.map((g) => (
                  <div key={g.name}>
                    {t('about.glossary.feature', {
                      label: g.label,
                      description: g.description || g.name,
                    })}
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
