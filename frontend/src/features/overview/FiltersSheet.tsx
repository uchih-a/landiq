/**
 * FiltersSheet — mobile bottom sheet for the Overview page's filter
 * controls (m01_overview).
 *
 * Two selectors (county + property type) + Done / Reset buttons.  Closes
 * itself on selection or when the backdrop is tapped.  The active
 * removable chips live in the page header (not here) so the user always
 * sees the current filter state.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { PillDropdown } from '@/components/PillDropdown';
import { ALL_VALUE } from './overview-helpers';

interface FiltersSheetProps {
  countyOptions: { value: string; label: string }[];
  propTypeOptions: { value: string; label: string }[];
  county: string;
  propType: string;
  onCountyChange: (v: string) => void;
  onPropTypeChange: (v: string) => void;
  onClose: () => void;
}

export function FiltersSheet({
  countyOptions,
  propTypeOptions,
  county,
  propType,
  onCountyChange,
  onPropTypeChange,
  onClose,
}: FiltersSheetProps) {
  const { t } = useTranslation();

  // Lock body scroll while the sheet is open + close on Escape.
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = orig;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={t('overview.filtersButton')}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative bg-surface-container-lowest rounded-t-3xl p-6 pb-8 shadow-2xl flex flex-col gap-4 animate-[slideUp_.2s_ease-out]">
        <div className="w-10 h-1 rounded-full bg-surface-container-highest mx-auto -mt-2 mb-1" />
        <h2 className="font-outfit text-headline-section text-on-surface">
          {t('overview.filtersButton')}
        </h2>
        <PillDropdown
          label={t('overview.filterCounty')}
          leadingIcon="location_on"
          options={countyOptions}
          value={county}
          onChange={onCountyChange}
        />
        <PillDropdown
          label={t('overview.filterPropertyType')}
          leadingIcon="category"
          options={propTypeOptions}
          value={propType}
          onChange={onPropTypeChange}
        />
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              onCountyChange(ALL_VALUE);
              onPropTypeChange(ALL_VALUE);
            }}
            className="text-sm text-secondary hover:text-on-surface underline-offset-2 hover:underline"
          >
            {t('overview.clearFilter')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-primary text-on-primary text-sm font-medium shadow-sm active:scale-95 transition-transform"
          >
            {t('common.done', { defaultValue: 'Done' })}
          </button>
        </div>
      </div>
    </div>
  );
}
