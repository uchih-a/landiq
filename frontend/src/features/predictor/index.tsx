/**
 * Predictor — the Price Predictor screen (B2 /predict).
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
 *   - 429 banner / generic error (error)
 *   - reliable / limited / unsupported (success — see PredictResult.tsx)
 *
 * Layout: 5/12 (form) + 7/12 (result) on xl+; stacked on smaller screens.
 */
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ValuationCard } from '@/components/ValuationCard';
import { usePredict } from '@/lib/api/hooks';
import type { PlaceSearchResult, PredictRequest } from '@/lib/api/types';

import { AboutStep } from './AboutStep';
import { LocationStep } from './LocationStep';
import { PredictResult } from './PredictResult';
import {
  PARCEL_FEATURE_KEYS,
  PROP_TYPE_OPTIONS,
  initialChecklist,
  triStateToChecklist,
  type ParcelFeatureKey,
  type TriState,
} from './predictor-helpers';

type Step = 1 | 2;

// Default confidence level for the conformal interval (0.80 = 80% range).
const DEFAULT_CONFIDENCE_LEVEL = 0.8;

interface StepPillProps {
  n: number;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Inline step indicator — not exported (kept private to this module). */
function StepPill({ n, label, active, disabled, onClick }: StepPillProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-label-metric font-label-metric transition-colors duration-150 ${
        active ? 'bg-surface-container-high text-on-surface' : 'text-secondary hover:text-on-surface'
      } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-secondary`}
    >
      <span
        className={`w-5 h-5 rounded-full text-caption-sm font-caption-sm flex items-center justify-center ${
          active ? 'bg-primary-container text-on-primary' : 'bg-surface-container-highest text-secondary'
        }`}
      >
        {n}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function Predictor() {
  const { t } = useTranslation();

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
  const [propType, setPropType] = useState<string>(PROP_TYPE_OPTIONS[0].value);
  const [checklist, setChecklist] = useState<Record<ParcelFeatureKey, TriState>>(
    initialChecklist(),
  );

  const predict = usePredict();

  // ---- Build the PredictRequest body (or null if the form is incomplete). ----
  const request = useMemo<PredictRequest | null>(() => {
    if (!place) return null;
    const lat = pinLat ?? place.latitude;
    const lon = pinLon ?? place.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const size = Number(sizeAcres);
    if (!Number.isFinite(size) || size <= 0) return null;
    if (!propType || propType.trim().length === 0) return null;
    return {
      lat,
      lon,
      size_acres: size,
      prop_type: propType,
      parcel_features: Object.fromEntries(
        PARCEL_FEATURE_KEYS.map((k) => [k, triStateToChecklist(checklist[k])]),
      ),
      confidence_level: DEFAULT_CONFIDENCE_LEVEL,
    };
  }, [place, pinLat, pinLon, sizeAcres, propType, checklist]);

  const canSubmit = request !== null;
  const hasPlace = place !== null;

  function handleSubmit() {
    if (!request) return;
    predict.mutate(request);
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

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      <header className="flex flex-col gap-1 pt-2">
        <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
          {t('nav.predictor')}
        </h1>
        <p className="text-body-regular text-on-surface-variant">
          {t('predictor.step1')} → {t('predictor.step2')}
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
                label={t('predictor.step1')}
                active={step === 1}
                onClick={() => setStep(1)}
              />
              <span className="text-secondary text-caption-sm">›</span>
              <StepPill
                n={2}
                label={t('predictor.step2')}
                active={step === 2}
                disabled={!hasPlace}
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
                  propType={propType}
                  onPropTypeChange={setPropType}
                  checklist={checklist}
                  onChecklistChange={setChecklist}
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
        <section className="xl:col-span-7">
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
