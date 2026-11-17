/**
 * AboutStep — Predictor Step 2: "About the land".
 *
 * - Parcel size input (acres, decimal-allowed).
 * - Property type pills (PROP_TYPE_OPTIONS).
 * - Infrastructure checklist: 10 items × 3-state TriStatePill.
 * - Estimate button — calls the parent's `onSubmit` (which builds the
 *   PredictRequest body and fires `usePredict().mutate()`).
 *
 * Title Documentation note: there is NO title-documentation field on this
 * step. The design's title-doc field lives on the *unsupported state* of
 * the result panel (see `PredictResult.tsx`) and is frontend-only — it is
 * not wired to the backend's PredictRequest schema.
 */
import { useTranslation } from 'react-i18next';

import { PillButton } from '@/components/PillButton';
import { PillInput } from '@/components/PillInput';

import { TriStatePill } from './TriStatePill';
import {
  PARCEL_FEATURE_KEYS,
  PARCEL_FEATURE_LABELS,
  PROP_TYPE_OPTIONS,
  type ParcelFeatureKey,
  type TriState,
} from './predictor-helpers';

interface AboutStepProps {
  sizeAcres: string;
  onSizeChange: (s: string) => void;
  propType: string;
  onPropTypeChange: (p: string) => void;
  checklist: Record<ParcelFeatureKey, TriState>;
  onChecklistChange: (c: Record<ParcelFeatureKey, TriState>) => void;
  placeName: string;
  onBack: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  isSubmitting: boolean;
}

export function AboutStep({
  sizeAcres,
  onSizeChange,
  propType,
  onPropTypeChange,
  checklist,
  onChecklistChange,
  placeName,
  onBack,
  onSubmit,
  canSubmit,
  isSubmitting,
}: AboutStepProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-space-lg">
      {placeName && (
        <div className="flex items-center gap-2 text-caption-sm text-secondary">
          <span className="material-symbols-outlined text-[16px] text-primary-container">location_on</span>
          <span>{placeName}</span>
        </div>
      )}

      {/* ---- Parcel size ---- */}
      <div className="flex flex-col gap-2">
        <label className="text-label-metric font-label-metric text-secondary" htmlFor="parcel-size">
          {t('predictor.parcelSize')}
        </label>
        <PillInput
          id="parcel-size"
          type="number"
          min="0"
          step="0.1"
          inputMode="decimal"
          leadingIcon="crop_square"
          placeholder="1.5"
          value={sizeAcres}
          onChange={(e) => onSizeChange(e.target.value)}
        />
      </div>

      {/* ---- Property type pills ---- */}
      <div className="flex flex-col gap-2">
        <label className="text-label-metric font-label-metric text-secondary">
          {t('predictor.propertyType')}
        </label>
        <div className="flex flex-wrap gap-2">
          {PROP_TYPE_OPTIONS.map((opt) => {
            const active = propType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPropTypeChange(opt.value)}
                aria-pressed={active}
                className={`px-4 py-2 rounded-full text-body-medium font-body-medium transition-all duration-150 ${
                  active
                    ? 'bg-primary-container text-on-primary shadow-md'
                    : 'bg-surface-container-lowest text-on-surface-variant border border-black/[0.06] hover:bg-surface-container-low hover:text-on-surface'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Infrastructure checklist (10 items) ---- */}
      <div className="flex flex-col gap-3">
        <label className="text-label-metric font-label-metric text-secondary">
          {t('predictor.parcelChecklist')}
        </label>
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
          {PARCEL_FEATURE_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-black/[0.04] last:border-0"
            >
              <span className="text-body-regular text-on-surface">
                {PARCEL_FEATURE_LABELS[key]}
              </span>
              <TriStatePill
                value={checklist[key]}
                onChange={(v) => onChecklistChange({ ...checklist, [key]: v })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ---- Navigation ---- */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-black/[0.06]">
        <PillButton variant="secondary" onClick={onBack} leadingIcon="arrow_back">
          Back
        </PillButton>
        <PillButton
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          leadingIcon={isSubmitting ? 'hourglass_top' : 'calculate'}
        >
          {isSubmitting ? t('common.loading') : t('predictor.estimate')}
        </PillButton>
      </div>
    </div>
  );
}
