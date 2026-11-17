/**
 * Pure helpers for the Explainability screen — kept in a non-component
 * module so the react-refresh `only-export-components` rule doesn't fire.
 *
 * Contents:
 *  - `DriverSummary` — minimal shape of a top SHAP driver (feature key +
 *    human label + mean |SHAP| value).
 *  - `buildSynthesis` — template a one-sentence plain-English
 *    synthesis from the top SHAP drivers. The backend does NOT generate
 *    natural-language synthesis; this text is templated client-side
 *    from the driver list returned by /model/explainability.
 */
export interface DriverSummary {
  feature: string;
  label: string;
  mean_abs_shap: number;
}

/**
 * Template a plain-English synthesis sentence from the top SHAP drivers.
 *
 * The backend does not generate natural-language synthesis — this text
 * is templated client-side from the driver list returned by
 * /model/explainability. The shape adapts to 1, 2, or 3+ drivers so
 * the sentence reads naturally regardless of how many drivers are
 * available.
 */
export function buildSynthesis(top: DriverSummary[]): string | null {
  if (top.length === 0) return null;
  const labels = top.map((d) => d.label);
  if (labels.length === 1) {
    return `Across all listings analysed, the model attributes the largest share of price variation to ${labels[0]}.`;
  }
  if (labels.length === 2) {
    return `Across all listings analysed, the model attributes the largest share of price variation to ${labels[0]}, followed by ${labels[1]}.`;
  }
  const head = labels.slice(0, -1).join(', ');
  const last = labels[labels.length - 1];
  return `Across all listings analysed, the model attributes the largest share of price variation to ${head}, and ${last}.`;
}
