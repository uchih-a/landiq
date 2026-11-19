/**
 * Predictor — the Price Predictor screen (B2 /predict).
 *
 * P2b real-data wiring:
 *  - Every list + bound + default comes from `usePredictOptions()`:
 *    property-type pills, parcel-size bounds, default confidence level,
 *    and the infrastructure checklist keys.  No local lists.
 *  - Step captions go through i18n with interpolation
 *    (`predictor.stepCaption` = "Step {{n}} of {{total}}").
 *  - The "80% range" wording everywhere is built from
 *    `response.confidence_level`, never typed.
 *  - Dragging the pin or picking a new place clears the previous result
 *    so a stale price is never shown for a new location.
 *  - Error handling: distinct, translated states for 422, 429
 *    (rate-limit with retry-after), 503 DATA_UNAVAILABLE, network
 *    failure, and options-load-failure (the form is disabled with a
 *    retry until /predict/options resolves).
 *
 * Two-step form (simple useState step — no router-level steps):
 *
 *   Step 1 "Where is the land?"   → LocationStep (search + map placeholder)
 *   Step 2 "About the land"        → AboutStep (size, prop-type pills,
 *                                    infrastructure checklist, Estimate btn)
 *
 * Submit builds a PredictRequest body from the form state and fires the
 * `usePredict()` mutation. The result panel (right column on desktop,
 * below on mobile) renders one of:
 *   - skeleton (pending — form stays interactive)
 *   - 429 banner / 422 field-error / 503 / generic error (error)
 *   - reliable / limited / unsupported (success — see PredictResult.tsx)
 *
 * Layout: 5/12 (form) + 7/12 (result) on xl+; stacked on smaller screens.
 */
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { ValuationCard } from '@/components/ValuationCard';
import { usePredict, usePredictOptions } from '@/lib/api/hooks';
import type { PlaceSearchResult, PredictRequest } from '@/lib/api/types';
import { saveLastEstimate } from '@/lib/store/lastEstimate';

import { AboutStep } from './AboutStep';
import { LocationStep } from './LocationStep';
import { PredictResult } from './PredictResult';
import {
  initialChecklist,
  triStateToChecklist,
  validateSizeAcres,
} from './predictor-helpers';

type Step = 1 | 2;
const TOTAL_STEPS = 2;

interface StepPillProps {
  n: number;
  total: number;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Inline step indicator — not exported (kept private to this module). */
function StepPill({ n, total, label, active, disabled, onClick }: StepPillProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-current={active ? 'step' : undefined}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-label-metric font-label-metric transition-colors duration-150 ${
        active ? 'bg-surface-container-high text-on-surface' : 'text-secondary hover:text-on-surface'
      } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-secondary`}
    >
      <span
        className={`w-5 h-5 rounded-full text-caption-sm font-caption-sm flex items-center justify-center ${
          active ? 'bg-primary-container text-on-primary' : 'bg-surface-container-highest text-secondary'
        }`}
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only">{t('predictor.stepCaption', { n, total })}</span>
    </button>
  );
}

export default function Predictor() {
  const { t } = useTranslation();

  // ---- Options: the canonical lists + bounds + defaults from the backend. ----
  const optionsQ = usePredictOptions();
  const options = optionsQ.data;
  const optionsReady = options != null;
  const optionsFailed = optionsQ.isError && !options;

  // ---- Form state (lifted here so the result panel can rebuild the body) ----
  const [step, setStep] = useState<Step>(1);
  const [query, setQuery] = useState('');
  // Debounce the typeahead via useDeferredValue — usePlaceSearch is
  // "debounce-aware" (it just reacts to the deferred value).
  const deferredQuery = useDeferredValue(query);
  const [place, setPlace] = useState<PlaceSearchResult | null>(null);
  // Fine-tuned coordinates from dragging the LocationStep pin. Reset to
  // null whenever the user picks a NEW place so the next prediction uses
  // the freshly-picked coordinates (and the pin snaps back to the place
  // centroid). The `request` useMemo falls back to `place.latitude`/
  // `place.longitude` when these are null.
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLon, setPinLon] = useState<number | null>(null);
  const [sizeAcres, setSizeAcres] = useState('');
  // Default selection = first returned value (Land).  No local list.
  const [propType, setPropType] = useState<string>('');
  const [checklist, setChecklist] = useState<Record<string, 'yes' | 'no' | 'unsure'>>(
    initialChecklist([]),
  );

  // When options load, seed the default prop_type + checklist state.
  // Runs once per options resolution (the effect deps are the option
  // arrays, which are referentially stable across re-renders thanks to
  // React Query's structural sharing).
  useEffect(() => {
    if (!options) return;
    setPropType((prev) => {
      if (prev && options.property_types_canonical.includes(prev)) return prev;
      return options.property_types_canonical[0] ?? '';
    });
    setChecklist((prev) => {
      // Only re-initialise when the key list actually changes — keep
      // any user selections for keys that still exist.
      const next = initialChecklist(options.parcel_features);
      for (const k of Object.keys(prev)) {
        if (k in next) next[k] = prev[k];
      }
      return next;
    });
  }, [options?.property_types_canonical, options?.parcel_features, options]);

  const predict = usePredict();

  // ---- Location-change detection: clear the previous result so a stale
  //      price is never shown for a new location. ----
  // Clear the mutation result when the location changes (new place
  // picked OR pin dragged).  This is the simplest way to guarantee no
  // stale price is shown for a new location — the reset effect below
  // fires on every place/pinLat/pinLon change.
  useEffect(() => {
    predict.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, pinLat, pinLon]);

  // ---- Build the PredictRequest body (or null if the form is incomplete
  //      OR the options haven't loaded). ----
  const sizeBounds = options?.size_acres;
  const sizeValidation = useMemo(() => {
    if (!sizeBounds) return null;
    return validateSizeAcres(sizeAcres, sizeBounds);
  }, [sizeAcres, sizeBounds]);

  const defaultConfidence = options?.default_confidence_level;

  const request = useMemo<PredictRequest | null>(() => {
    if (!options) return null;
    if (!place) return null;
    const lat = pinLat ?? place.latitude;
    const lon = pinLon ?? place.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (!sizeValidation || !sizeValidation.ok) return null;
    if (!propType || propType.trim().length === 0) return null;
    if (!defaultConfidence) return null;
    // Build parcel_features ONLY from the options' key list — never send
    // any key the schema doesn't accept (no TITLE_DOC_KEY).
    return {
      lat,
      lon,
      size_acres: sizeValidation.value,
      prop_type: propType,
      parcel_features: Object.fromEntries(
        options.parcel_features.map((k) => [k, triStateToChecklist(checklist[k] ?? 'unsure')]),
      ),
      confidence_level: defaultConfidence,
    };
  }, [options, place, pinLat, pinLon, sizeValidation, propType, checklist, defaultConfidence]);

  const canSubmit = request !== null && !optionsFailed;
  const hasPlace = place !== null;

  function handleSubmit() {
    if (!request) return;
    // P6b: keep the last SUCCESSFUL estimate in the shared store so the
    // Explainability screen's "One estimate" mode can render its drivers
    // (request + response verbatim + the place name / timestamp from the
    // client context).  Storage failures are handled inside the store.
    predict.mutate(request, {
      onSuccess: (data) => {
        saveLastEstimate({
          request,
          response: data,
          placeName: place?.name ?? null,
          createdAt: new Date().toISOString(),
        });
      },
    });
  }

  function handlePick(r: PlaceSearchResult) {
    setPlace(r);
    // Reset the fine-tuned pin coords so a new search result's centroid
    // is the starting point for the next drag.
    setPinLat(null);
    setPinLon(null);
    setStep(2);
  }

  function handlePinDrag(lat: number, lon: number) {
    setPinLat(lat);
    setPinLon(lon);
  }

  // ---- Options-load-failure: show an error state with retry and disable
  //      the form until /predict/options resolves. ----
  if (optionsFailed) {
    return (
      <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
        <header className="flex flex-col gap-1 pt-2">
          <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
            {t('nav.predictor')}
          </h1>
        </header>
        <EmptyState
          icon="cloud_off"
          title={t('common.error')}
          message={t('predictor.optionsLoadFailed')}
          actionLabel={t('common.retry')}
          onAction={() => optionsQ.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      <header className="flex flex-col gap-1 pt-2">
        <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
          {t('nav.predictor')}
        </h1>
        <p className="text-body-regular text-on-surface-variant" aria-live="polite">
          {t('predictor.stepCaption', { n: step, total: TOTAL_STEPS })}
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ---- Form column ---- */}
        <section className="xl:col-span-5">
          <ValuationCard noPadding>
            {/* Step indicator */}
            <div className="flex items-center gap-2 px-space-lg pt-space-lg pb-3 border-b border-black/[0.04]">
              <StepPill
                n={1}
                total={TOTAL_STEPS}
                label={t('predictor.step1')}
                active={step === 1}
                onClick={() => setStep(1)}
              />
              <span className="text-secondary text-caption-sm" aria-hidden="true">›</span>
              <StepPill
                n={2}
                total={TOTAL_STEPS}
                label={t('predictor.step2')}
                active={step === 2}
                disabled={!hasPlace || !optionsReady}
                onClick={() => setStep(2)}
              />
            </div>

            <div className="p-space-lg">
              {step === 1 ? (
                <LocationStep
                  query={query}
                  deferredQuery={deferredQuery}
                  onQueryChange={setQuery}
                  place={place}
                  onPick={handlePick}
                  onPinDrag={handlePinDrag}
                />
              ) : (
                <AboutStep
                  sizeAcres={sizeAcres}
                  onSizeChange={setSizeAcres}
                  sizeValidation={sizeValidation}
                  sizeBounds={sizeBounds ?? null}
                  sizeMedian={options?.size_acres.median ?? null}
                  propType={propType}
                  onPropTypeChange={setPropType}
                  propertyTypes={options?.property_types ?? []}
                  checklist={checklist}
                  onChecklistChange={setChecklist}
                  checklistKeys={options?.parcel_features ?? []}
                  placeName={place?.name ?? ''}
                  onBack={() => setStep(1)}
                  onSubmit={handleSubmit}
                  canSubmit={canSubmit}
                  isSubmitting={predict.isPending}
                />
              )}
            </div>
          </ValuationCard>
        </section>

        {/* ---- Result column ---- */}
        <section className="xl:col-span-7" aria-live="polite">
          {!predict.data && !predict.isPending && !predict.error && place && (
            // Location changed after a previous result — show the
            // "re-estimate" hint instead of the idle prompt.
            <div className="rounded-2xl bg-surface-container-low p-4 text-caption-sm text-secondary flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary-container" aria-hidden="true">
                refresh
              </span>
              {t('predictor.locationChanged')}
            </div>
          )}
          <PredictResult
            isPending={predict.isPending}
            error={predict.error ?? null}
            data={predict.data}
            onRetry={handleSubmit}
          />
        </section>
      </div>
    </div>
  );
}
