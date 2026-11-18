/**
 * Chart colour tokens — the SVG-side mirror of the Tailwind design tokens
 * in tailwind.config.ts (P6b problem J).
 *
 * Recharts fills/strokes are raw SVG attribute values, so Tailwind class
 * names cannot reach them.  Instead of every chart component re-typing a
 * hex (the duplication P6b / P5b flagged), the palette lives HERE, once
 * per colour, with the tailwind token it mirrors named in the comment.
 * The palette is unchanged — only single-sourced.
 *
 * These are UI constants (documented design tokens), not data values.
 */

/** Mirrors the tailwind token `primary-container` (#e8742a — the brand
 *  orange used for the primary chart series). */
export const CHART_COLOR_PRIMARY_CONTAINER = '#e8742a';

/** Mirrors the tailwind token `secondary` (#6a5b56 — the muted brown
 *  used for secondary / neural-family series). */
export const CHART_COLOR_SECONDARY = '#6a5b56';

/** Mirrors the tailwind token `on-surface-variant` (#574238 — axis text
 *  and strokes). */
export const CHART_COLOR_ON_SURFACE_VARIANT = '#574238';

/** Mirrors the tailwind token `on-surface` (#1f1b16 — the darker ink used
 *  for parity / identity lines that need more emphasis than axis ink). */
export const CHART_COLOR_ON_SURFACE = '#1f1b16';

/** Mirrors the tailwind token `tertiary` (#006d3b — the green used for the
 *  test-split scatter on the actual-vs-predicted chart, distinct from the
 *  orange OOF scatter). */
export const CHART_COLOR_TERTIARY = '#006d3b';

/**
 * Colour for one ensemble member, keyed by the backend-served `family`
 * (from /model/explainability `models[*].family` — 'tree' / 'neural' /
 * 'ensemble' / 'baseline').  Never keyed by model name.
 */
export function chartColorForFamily(family: string | null | undefined): string {
  switch (family) {
    case 'neural':
      return CHART_COLOR_SECONDARY;
    default:
      return CHART_COLOR_PRIMARY_CONTAINER;
  }
}

// ----------------------------------------------------------------------
// Data Explorer ramp tokens (P7b-D) — the 09_data_explorer_quality price
// histogram ramp + hatch colours, single-sourced here with the tailwind
// token each mirrors.  The RAMP THRESHOLDS (which relative bin height
// gets which colour) are presentation constants — a display choice, not
// a data fact — and are defined once, below, with this comment.
// ----------------------------------------------------------------------

/** Mirrors the tailwind token `outline-variant` (#dec1b3 — pale ramp start). */
export const CHART_COLOR_RAMP_PALE = '#dec1b3';

/** Mirrors the tailwind token `inverse-primary` (#ffb68f — light ramp mid). */
export const CHART_COLOR_RAMP_LIGHT = '#ffb68f';

/** Same orange as CHART_COLOR_PRIMARY_CONTAINER (#e8742a — ramp mid). */
export const CHART_COLOR_RAMP_MID = '#e8742a';

/** Mirrors the tailwind token `primary` (#9d4400 — dark ramp end). */
export const CHART_COLOR_RAMP_DEEP = '#9d4400';

/** Mirrors the tailwind token `outline` (#8a7266 — percentile marker lines
 *  and the muted hatch of below-threshold bars). */
export const CHART_COLOR_OUTLINE = '#8a7266';

/**
 * Price-histogram colour ramp thresholds (P7b-D).  PRESENTATION
 * CONSTANTS, not data facts: they pick which of the four ramp colours a
 * bin gets based on its height RELATIVE to the tallest bin, purely so
 * the histogram reads at a glance.  Changing these changes the look,
 * never the numbers.  The cut-offs partition the (0, 1] relative-height
 * range: <=0.05 pale, <=0.2 light, <=0.45 mid, else deep.
 */
export const PRICE_RAMP_CUTOFFS = { pale: 0.05, light: 0.2, mid: 0.45 } as const;
