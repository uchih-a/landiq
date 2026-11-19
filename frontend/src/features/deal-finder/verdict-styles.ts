/**
 * The single verdict colour-token map (UI constants defined once —
 * P4b problem K).  Lives in its own module (not a component file) so
 * react-refresh's only-export-components rule stays satisfied.
 *
 * Used by the ResultsTable chips, the DealMap markers, and the
 * ListingDetailPanel chip — one definition, no duplicates.
 */
export interface VerdictStyle {
  chip: string;
  dot: string;
  hex: string;
  labelKey: string;
}

export const VERDICT_STYLES: Record<string, VerdictStyle> = {
  underpriced: {
    chip: 'bg-[#E8F5E9] text-[#2D6A4F]',
    dot: 'bg-[#2D6A4F]',
    hex: '#2D6A4F',
    labelKey: 'common.underpriced',
  },
  overpriced: {
    chip: 'bg-[#FBEBE8] text-[#C84B31]',
    dot: 'bg-[#C84B31]',
    hex: '#C84B31',
    labelKey: 'common.overpriced',
  },
  fair: {
    chip: 'bg-surface-container text-[#5C5752]',
    dot: 'bg-[#5C5752]',
    hex: '#5C5752',
    labelKey: 'common.fair',
  },
};

export function verdictStyle(verdict: string): VerdictStyle {
  return VERDICT_STYLES[(verdict ?? '').toLowerCase()] ?? VERDICT_STYLES['fair'];
}

/**
 * Part B — the suspect-listing gate chip.  Rendered INSTEAD of the verdict
 * chip when ``is_suspect`` is true.  Grey (neutral) so it never reads as a
 * deal signal; the tooltip carries the reason.
 */
export const SUSPECT_STYLE: VerdictStyle = {
  chip: 'bg-surface-container-high text-secondary',
  dot: 'bg-secondary',
  hex: '#5C5752',
  labelKey: 'deals.suspectData',
};

/**
 * Map a backend ``suspect_reason`` to its i18n label key.  Unknown reasons
 * fall back to a generic label so the chip always has readable text.
 */
export function suspectReasonLabelKey(reason: string | null | undefined): string {
  switch (reason) {
    case 'listed_far_below_model':
      return 'deals.suspectReason.listed_far_below_model';
    case 'listed_far_above_model':
      return 'deals.suspectReason.listed_far_above_model';
    case 'non_finite_size':
      return 'deals.suspectReason.non_finite_size';
    default:
      return 'deals.suspectData';
  }
}
