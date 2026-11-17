/**
 * FiltersBar — the Deal Finder filter bar.
 *
 * P4 fidelity pass: added Near amenity chips (School/Hospital/Tarmac road)
 * with 1/3/5 km segmented control, Hide data errors toggle, and Reset
 * filters button — all wired to real backend parameters
 * (near_amenity, radius_km, data_quality_flag).
 *
 * Per 06_deal_finder/code.html:
 *  - Primary row: County / Type / Asking per acre / Size pills + verdict chips
 *  - Secondary row: Near amenity chips + radius selector + Hide errors toggle + Reset
 *
 * Design elements NOT built (reported in known-gaps.md):
 *  - "Asking per acre" range filter — backend has no price_range param
 *  - "Size" range filter — backend has no size_range param
 *  - "Saved Filters (n)" — no saved-filters feature exists
 */
import { useTranslation } from 'react-i18next';

import { PillButton, PillDropdown, ValuationCard } from '@/components';
import type { AmenityRadiusKm, NearAmenityFilter, VerdictFilter } from '@/lib/api/types';

const PROP_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All property types' },
  { value: 'Land', label: 'Land' },
  { value: 'Farm', label: 'Farm' },
  { value: 'Residential', label: 'Residential' },
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Industrial', label: 'Industrial' },
  { value: 'Plot', label: 'Plot' },
];

const PAGE_SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: '10', label: '10 per page' },
  { value: '20', label: '20 per page' },
  { value: '50', label: '50 per page' },
];

const VERDICT_OPTIONS: { value: VerdictFilter; chip: 'underpriced' | 'fair' | 'overpriced'; label: string }[] = [
  { value: 'underpriced', chip: 'underpriced', label: 'Underpriced' },
  { value: 'fair', chip: 'fair', label: 'Fair' },
  { value: 'overpriced', chip: 'overpriced', label: 'Overpriced' },
];

const AMENITY_OPTIONS: { value: NearAmenityFilter; label: string; icon: string }[] = [
  { value: 'school', label: 'School', icon: 'school' },
  { value: 'hospital', label: 'Hospital', icon: 'local_hospital' },
  { value: 'tarmac_road', label: 'Tarmac road', icon: 'add_road' },
];

const RADIUS_OPTIONS: AmenityRadiusKm[] = [1, 3, 5];

interface Props {
  countyOptions: { value: string; label: string }[];
  county: string;
  onCountyChange: (v: string) => void;
  propType: string;
  onPropTypeChange: (v: string) => void;
  verdict: VerdictFilter | null;
  onVerdictChange: (v: VerdictFilter | null) => void;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  sortAsc: boolean;
  onSortToggle: () => void;
  nearAmenity: NearAmenityFilter | null;
  onNearAmenityChange: (v: NearAmenityFilter | null) => void;
  amenityRadius: AmenityRadiusKm;
  onAmenityRadiusChange: (r: AmenityRadiusKm) => void;
  hideDataErrors: boolean;
  onHideDataErrorsChange: (v: boolean) => void;
  onResetFilters: () => void;
  onExport: () => void;
  isExporting?: boolean;
}

export function FiltersBar({
  countyOptions,
  county,
  onCountyChange,
  propType,
  onPropTypeChange,
  verdict,
  onVerdictChange,
  pageSize,
  onPageSizeChange,
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
            label="Property type"
            leadingIcon="category"
            options={PROP_TYPE_OPTIONS}
            value={propType}
            onChange={onPropTypeChange}
          />
          <PillDropdown
            label="Page size"
            options={PAGE_SIZE_OPTIONS}
            value={String(pageSize)}
            onChange={(v) => onPageSizeChange(Number(v))}
          />
          {/* Verdict chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {VERDICT_OPTIONS.map((o) => {
              const isActive = verdict === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onVerdictChange(isActive ? null : o.value)}
                  className={`h-9 px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
                    isActive
                      ? o.value === 'underpriced'
                        ? 'bg-[#E8F5E9] text-[#2D6A4F] shadow-sm'
                        : o.value === 'overpriced'
                        ? 'bg-[#FBEBE8] text-[#C84B31] shadow-sm'
                        : 'bg-surface-container-high text-on-surface shadow-sm'
                      : 'bg-surface-container-low text-secondary hover:text-on-surface'
                  }`}
                  aria-label={`${o.label} filter`}
                >
                  {isActive && <span className="material-symbols-outlined text-[15px]">check_circle</span>}
                  {!isActive && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor:
                          o.value === 'underpriced' ? '#2D6A4F' :
                          o.value === 'overpriced' ? '#C84B31' : '#5C5752',
                      }}
                    />
                  )}
                  {o.label}
                </button>
              );
            })}
          </div>
          {/* Sort toggle */}
          <PillButton
            variant="secondary"
            leadingIcon={sortAsc ? 'arrow_upward' : 'arrow_downward'}
            onClick={onSortToggle}
            className="text-xs"
          >
            {sortAsc ? 'Best value first' : 'Worst value first'}
          </PillButton>
        </div>

        {/* Secondary filter row: amenities + data quality + reset */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-surface-container">
          {/* Near amenity chips + radius selector */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-secondary font-medium mr-1">Near amenity:</span>
            {AMENITY_OPTIONS.map((a) => {
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
                  <span className="material-symbols-outlined text-[14px]">{a.icon}</span>
                  {a.label}
                </button>
              );
            })}
            {/* Radius segmented control (only visible when an amenity is selected) */}
            {nearAmenity && (
              <div className="inline-flex items-center bg-surface-container p-0.5 rounded-full ml-1">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onAmenityRadiusChange(r)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                      amenityRadius === r
                        ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold'
                        : 'text-secondary hover:text-on-surface'
                    }`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Data quality toggle + reset */}
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-on-surface font-medium">Hide possible data errors</span>
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
              <span className="material-symbols-outlined text-[14px]">restart_alt</span>
              Reset filters
            </button>
          </div>
        </div>
      </div>
    </ValuationCard>
  );
}
