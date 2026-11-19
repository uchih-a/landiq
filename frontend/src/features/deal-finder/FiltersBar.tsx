/**
 * FiltersBar — the Deal Finder filter bar (P4b real-data round).
 *
 * EVERY option list comes from `useListingsOptions()`:
 *  - property types (canonical three) + counties (exact names)
 *  - verdict chips with data-derived rules (tooltip shows the real
 *    thresholds from the response — no typed percentages)
 *  - page sizes / default from the options
 *  - amenity + radius lists (disabled with a reason when
 *    amenity_filter_available is false)
 *  - sort keys + direction toggle (server-side sort)
 * The local PROP_TYPE_OPTIONS / PAGE_SIZE_OPTIONS / AMENITY_OPTIONS /
 * RADIUS_OPTIONS arrays are GONE.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PillButton, PillDropdown, ValuationCard } from '@/components';
import type {
  AmenityOption,
  ListingsOptionsResponse,
  SortKeyOption,
  VerdictOption,
} from '@/lib/api/types';

interface Props {
  options: ListingsOptionsResponse | undefined;
  optionsFailed: boolean;
  onRetryOptions: () => void;
  county: string;
  onCountyChange: (v: string) => void;
  propType: string;
  onPropTypeChange: (v: string) => void;
  verdict: string | null;
  onVerdictChange: (v: string | null) => void;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  sortKey: string;
  onSortKeyChange: (v: string) => void;
  sortAsc: boolean;
  onSortToggle: () => void;
  nearAmenity: string | null;
  onNearAmenityChange: (v: string | null) => void;
  amenityRadius: number;
  onAmenityRadiusChange: (r: number) => void;
  hideDataErrors: boolean;
  onHideDataErrorsChange: (v: boolean) => void;
  onResetFilters: () => void;
}

export function FiltersBar({
  options,
  optionsFailed,
  onRetryOptions,
  county,
  onCountyChange,
  propType,
  onPropTypeChange,
  verdict,
  onVerdictChange,
  pageSize,
  onPageSizeChange,
  sortKey,
  onSortKeyChange,
  sortAsc,
  onSortToggle,
  nearAmenity,
  onNearAmenityChange,
  amenityRadius,
  onAmenityRadiusChange,
  hideDataErrors,
  onHideDataErrorsChange,
  onResetFilters,
}: Props) {
  const { t } = useTranslation();
  const [verdictHelp, setVerdictHelp] = useState<string | null>(null);

  // ---- Option lists from the response (never typed). ----
  const countyOptions = [
    { value: 'all', label: t('common.allCounties') },
    ...(options?.counties ?? []).map((c) => ({ value: c.name, label: `${c.name} (${c.n})` })),
  ];
  const propTypeOptions = [
    { value: 'all', label: t('market.allPropertyTypes') },
    ...(options?.property_types ?? []).map((pt) => ({ value: pt.name, label: `${pt.name} (${pt.n})` })),
  ];
  const pageSizeOptions = (options?.page_sizes ?? []).map((n) => ({
    value: String(n),
    label: t('deals.perPage', { n }),
  }));
  const sortOptions = (options?.sort_keys ?? []).map((sk: SortKeyOption) => ({
    value: sk.value,
    label: t(sk.label_key),
  }));
  const verdicts: VerdictOption[] = options?.verdicts ?? [];
  const amenities: AmenityOption[] = options?.amenities ?? [];
  const radii: number[] = options?.radii_km ?? [];
  const amenityAvailable = options?.amenity_filter_available ?? false;

  // Verdict help text (from the response's data-derived rule).
  function verdictHelpText(v: VerdictOption): string {
    const r = v.rule ?? {};
    const parts: string[] = [];
    if (r.basis === 'conformal_interval' && r.interval_low_ref && r.interval_high_ref) {
      parts.push(
        t('deals.verdictRuleInterval', {
          low: r.interval_low_ref,
          high: r.interval_high_ref,
        }),
      );
    }
    if (r.under_ratio_max != null) {
      parts.push(t('deals.verdictRuleUnder', { x: (r.under_ratio_max * 100).toFixed(0) }));
    }
    if (r.over_ratio_min != null) {
      parts.push(t('deals.verdictRuleOver', { x: (r.over_ratio_min * 100).toFixed(0) }));
    }
    if (r.match_rate != null) {
      parts.push(t('deals.verdictRuleMatch', { pct: (r.match_rate * 100).toFixed(0) }));
    }
    return parts.join(' · ') || t('deals.verdictRuleUnavailable');
  }

  if (optionsFailed) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-md flex items-center justify-between gap-3">
          <span className="text-caption-sm text-secondary">
            {t('deals.optionsLoadFailed')}
          </span>
          <button
            type="button"
            onClick={onRetryOptions}
            className="text-xs text-primary hover:underline"
          >
            {t('common.retry')}
          </button>
        </div>
      </ValuationCard>
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-md flex flex-col gap-4">
        {/* Primary filter row */}
        <div className="flex flex-wrap items-center gap-2.5">
          <PillDropdown
            label={t('common.county')}
            leadingIcon="location_on"
            options={countyOptions}
            value={county}
            onChange={onCountyChange}
          />
          <PillDropdown
            label={t('predictor.propertyType')}
            leadingIcon="category"
            options={propTypeOptions}
            value={propType}
            onChange={onPropTypeChange}
          />
          <PillDropdown
            label={t('deals.pageSize')}
            options={pageSizeOptions}
            value={String(pageSize)}
            onChange={(v) => onPageSizeChange(Number(v))}
          />
          {/* Sort key select + direction toggle (server-side). */}
          <PillDropdown
            label={t('deals.sortBy')}
            leadingIcon="sort"
            options={sortOptions}
            value={sortKey}
            onChange={onSortKeyChange}
          />
          <PillButton
            variant="secondary"
            leadingIcon={sortAsc ? 'arrow_upward' : 'arrow_downward'}
            onClick={onSortToggle}
            className="text-xs"
            aria-label={sortAsc ? t('deals.sortAsc') : t('deals.sortDesc')}
          >
            {sortAsc ? t('deals.bestValueFirst') : t('deals.worstValueFirst')}
          </PillButton>

          {/* Verdict chips + help */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {verdicts.map((v) => {
              const isActive = verdict === v.value;
              return (
                <span key={v.value} className="relative inline-flex">
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onVerdictChange(isActive ? null : v.value)}
                    className={`h-9 px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
                      isActive
                        ? v.value === 'underpriced'
                          ? 'bg-[#E8F5E9] text-[#2D6A4F] shadow-sm'
                          : v.value === 'overpriced'
                            ? 'bg-[#FBEBE8] text-[#C84B31] shadow-sm'
                            : 'bg-surface-container-high text-on-surface shadow-sm'
                        : 'bg-surface-container-low text-secondary hover:text-on-surface'
                    }`}
                    aria-label={t(v.label_key)}
                  >
                    {isActive && (
                      <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                        check_circle
                      </span>
                    )}
                    {t(v.label_key)}
                  </button>
                  <button
                    type="button"
                    aria-label={t('deals.verdictHelpA11y', { verdict: t(v.label_key) })}
                    onClick={() => setVerdictHelp(verdictHelp === v.value ? null : v.value)}
                    className="ml-0.5 w-5 h-5 rounded-full bg-surface-container-highest text-secondary text-[11px] flex items-center justify-center hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                      help
                    </span>
                  </button>
                  {verdictHelp === v.value && (
                    <span
                      role="tooltip"
                      className="absolute top-full left-0 mt-1 z-20 max-w-xs bg-surface-container-lowest border border-black/[0.08] shadow-level-2 rounded-DEFAULT p-2 text-caption-sm text-secondary normal-case whitespace-normal"
                    >
                      {verdictHelpText(v)}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        {/* Secondary filter row: amenities + data quality + reset */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-surface-container">
          {/* Near amenity + radius — disabled with a reason when
              amenity_filter_available is false. */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-secondary font-medium">{t('deals.nearAmenity')}:</span>
            {!amenityAvailable ? (
              <span className="text-caption-sm text-secondary italic" title={t('deals.amenityUnavailableReason')}>
                {t('deals.amenityUnavailable')}
              </span>
            ) : (
              <>
                {amenities.map((a) => {
                  const isActive = nearAmenity === a.value;
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => onNearAmenityChange(isActive ? null : a.value)}
                      className={`px-3 py-1.5 rounded-full font-medium inline-flex items-center gap-1 transition-colors ${
                        isActive
                          ? 'bg-primary-fixed text-on-primary-fixed-variant'
                          : 'bg-surface-container-low text-secondary hover:text-on-surface hover:bg-surface-container'
                      }`}
                    >
                      {t(a.label_key)}
                    </button>
                  );
                })}
                {/* Radius — disabled until an amenity is chosen; always
                    sent together with the amenity. */}
                {nearAmenity && (
                  <div className="inline-flex items-center bg-surface-container p-0.5 rounded-full ml-1" role="radiogroup" aria-label={t('deals.radius')}>
                    {radii.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={amenityRadius === r}
                        onClick={() => onAmenityRadiusChange(r)}
                        className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                          amenityRadius === r
                            ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold'
                            : 'text-secondary hover:text-on-surface'
                        }`}
                      >
                        {t('deals.km', { n: r })}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Data anomalies toggle + reset */}
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none" title={t('deals.anomaliesOnlyHint')}>
              <span className="text-xs text-on-surface font-medium">{t('deals.anomaliesOnly')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={hideDataErrors}
                onClick={() => onHideDataErrorsChange(!hideDataErrors)}
                className={`relative w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                  hideDataErrors ? 'bg-primary-container' : 'bg-surface-container-high'
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                    hideDataErrors ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
            <button
              type="button"
              onClick={onResetFilters}
              className="text-xs text-secondary hover:text-primary transition-colors flex items-center gap-1 underline underline-offset-2"
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                restart_alt
              </span>
              {t('deals.resetFilters')}
            </button>
          </div>
        </div>
      </div>
    </ValuationCard>
  );
}
