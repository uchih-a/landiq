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
