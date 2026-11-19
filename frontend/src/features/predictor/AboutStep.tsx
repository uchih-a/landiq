/**
 * AboutStep — Predictor Step 2: "About the land".
 *
 * P2b real-data wiring:
 *  - Property-type pills rendered from `options.property_types`
 *    (the backend's canonical list with per-type row counts).  No local
 *    list.  Three pills only (Land / Farm / Commercial).
 *  - Infrastructure checklist iterated from `options.parcel_features`
 *    (the ten backend keys).  Labels stay in i18n, keyed by the backend
 *    keys (`predictor.feature.borehole` etc.).
 *  - Parcel-size input: bounds + validation from `options.size_acres`
 *    (1st/99th percentile).  Inline validation messages (empty, <=0,
 *    below/above supported range) with translated copy.  The button
 *    stays disabled with a visible reason.
 *  - Every user-visible string goes through i18n (en + sw).
 */
import { useTranslation } from 'react-i18next';

import { PillButton } from '@/components/PillButton';
import { PillInput } from '@/components/PillInput';

import { TriStatePill } from './TriStatePill';
import type { SizeValidation } from './predictor-helpers';
import type { PredictPropertyTypeOption, PredictSizeAcresBounds } from '@/lib/api/types';

interface AboutStepProps {
  sizeAcres: string;
  onSizeChange: (s: string) => void;
  sizeValidation: SizeValidation | null;
  sizeBounds: PredictSizeAcresBounds | null;
  sizeMedian: number | null;
  propType: string;
  onPropTypeChange: (p: string) => void;
  propertyTypes: PredictPropertyTypeOption[];
  checklist: Record<string, 'yes' | 'no' | 'unsure'>;
  onChecklistChange: (c: Record<string, 'yes' | 'no' | 'unsure'>) => void;
  checklistKeys: string[];
  placeName: string;
  onBack: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  isSubmitting: boolean;
}

export function AboutStep({
  sizeAcres,
  onSizeChange,
  sizeValidation,
  sizeBounds,
  sizeMedian,
  propType,
  onPropTypeChange,
  propertyTypes,
  checklist,
  onChecklistChange,
  checklistKeys,
  placeName,
  onBack,
  onSubmit,
  canSubmit,
  isSubmitting,
}: AboutStepProps) {
  const { t } = useTranslation();

  // The placeholder is a neutral hint derived from the median size in
  // the data — never a fake "1.5".  When the median isn't available
  // (options still loading), show a generic hint.
  const sizePlaceholder = sizeMedian != null
    ? t('predictor.parcelSizePlaceholder', { median: sizeMedian.toFixed(2) })
    : t('predictor.parcelSize');

  // Inline validation message (translated).  Empty when the input is
  // valid or when the bounds haven't loaded yet.
  const sizeErrorId = 'parcel-size-error';
  const sizeErrorMessage = (() => {
    if (!sizeValidation || sizeValidation.ok) return null;
    switch (sizeValidation.reason) {
      case 'empty':
        return t('predictor.parcelSizeEmpty');
      case 'nonpositive':
        return t('predictor.parcelSizeNonPositive');
      case 'not-a-number':
        return t('predictor.parcelSizeNotNumber');
      case 'below-min':
        return t('predictor.parcelSizeBelowMin', { min: sizeValidation.min?.toFixed(2) });
      case 'above-max':
        return t('predictor.parcelSizeAboveMax', { max: sizeValidation.max?.toFixed(2) });
      default:
        return null;
    }
  })();

  // The size input's min/max/step come from the options response (the
  // 1st/99th percentile bounds).  When the bounds haven't loaded, leave
  // them unset (the input accepts any value; validation runs in JS).
  const minAttr = sizeBounds ? sizeBounds.min.toFixed(2) : undefined;
  const maxAttr = sizeBounds ? sizeBounds.max.toFixed(2) : undefined;
  // step: a sensible decimal step (UI constant — not a data fact).
  const STEP = 0.01;

  return (
    <div className="flex flex-col gap-space-lg">
      {placeName && (
        <div className="flex items-center gap-2 text-caption-sm text-secondary">
          <span className="material-symbols-outlined text-[16px] text-primary-container" aria-hidden="true">
            location_on
          </span>
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
          min={minAttr}
          max={maxAttr}
          step={STEP}
          inputMode="decimal"
          leadingIcon="crop_square"
          placeholder={sizePlaceholder}
          value={sizeAcres}
          onChange={(e) => onSizeChange(e.target.value)}
          aria-invalid={sizeErrorMessage != null}
          aria-describedby={sizeErrorMessage ? sizeErrorId : undefined}
        />
        {sizeErrorMessage && (
          <p
            id={sizeErrorId}
            role="alert"
            className="text-caption-sm text-market-overvalued flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              error
            </span>
            {sizeErrorMessage}
          </p>
        )}
      </div>

      {/* ---- Property type pills ---- */}
      <div className="flex flex-col gap-2">
        <label className="text-label-metric font-label-metric text-secondary" id="prop-type-label">
          {t('predictor.propertyType')}
        </label>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-labelledby="prop-type-label"
        >
          {propertyTypes.map((opt) => {
            const active = propType === opt.name;
            return (
              <button
                key={opt.name}
                type="button"
                onClick={() => onPropTypeChange(opt.name)}
                role="radio"
                aria-checked={active}
                className={`px-4 py-2 rounded-full text-body-medium font-body-medium transition-all duration-150 ${
                  active
                    ? 'bg-primary-container text-on-primary shadow-md'
                    : 'bg-surface-container-lowest text-on-surface-variant border border-black/[0.06] hover:bg-surface-container-low hover:text-on-surface'
                }`}
              >
                {t('predictor.propertyTypeCount', { name: opt.name, n: opt.n })}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Infrastructure checklist (iterates the backend's key list) ---- */}
      <div className="flex flex-col gap-3">
        <label className="text-label-metric font-label-metric text-secondary" id="checklist-label">
          {t('predictor.parcelChecklist')}
        </label>
        <div
          className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1"
          role="group"
          aria-labelledby="checklist-label"
        >
          {checklistKeys.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-black/[0.04] last:border-0"
            >
              <span className="text-body-regular text-on-surface">
                {/* Labels stay in i18n, keyed by the backend's key name. */}
                {t(`predictor.feature.${key}`)}
              </span>
              <TriStatePill
                value={checklist[key] ?? 'unsure'}
                onChange={(v) => onChecklistChange({ ...checklist, [key]: v })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ---- Navigation ---- */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-black/[0.06]">
        <PillButton variant="secondary" onClick={onBack} leadingIcon="arrow_back">
          {t('common.back')}
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
