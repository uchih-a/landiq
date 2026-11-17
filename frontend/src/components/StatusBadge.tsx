/**
 * StatusBadge — the three-state confidence badge from the Predictor screens.
 *
 * Extracted from code.html of all three predictor screens:
 *
 * 1. "Reliable estimate" (02_predictor_reliable):
 *    - Dot: bg #2F9E5F (market-opportunity), 8px (w-2 h-2)
 *    - Text: "Reliable estimate" in caption-sm, text-secondary
 *    - Container: flex items-center gap-1.5
 *
 * 2. "Limited data" (03_predictor_limited_data):
 *    - Pill: inline-flex items-center gap-1.5 px-3 py-1 rounded-full
 *      bg #E3A008/15, text #855B04, label-metric font
 *    - Dot: w-2 h-2 rounded-full bg #E3A008 (market-caution)
 *
 * 3. "Unsupported" / "Sample Threshold Unmet" (04_predictor_unsupported):
 *    - Pill: px-3.5 py-1 rounded-full bg-surface-container text-secondary
 *      label-uppercase font, tracking-wider
 *    - Label: "Sample Threshold Unmet"
 */

export type Status = 'reliable' | 'limited' | 'unsupported';

interface StatusBadgeProps {
  status: Status;
  /** Override the default label text */
  label?: string;
  className?: string;
}

const STYLES: Record<Status, { container: string; dot?: string; defaultLabel: string }> = {
  reliable: {
    // Dot-only style — no pill background, just the dot + text
    container: 'inline-flex items-center gap-1.5 text-caption-sm font-caption-sm text-secondary',
    dot: 'w-2 h-2 rounded-full bg-market-opportunity',
    defaultLabel: 'Reliable estimate',
  },
  limited: {
    // Amber pill with dot
    container:
      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-metric font-label-metric bg-[#E3A008]/15 text-[#855B04]',
    dot: 'w-2 h-2 rounded-full bg-market-caution',
    defaultLabel: 'Limited data',
  },
  unsupported: {
    // Neutral surface-container pill, uppercase
    container:
      'inline-flex items-center px-3.5 py-1 rounded-full bg-surface-container text-secondary font-label-uppercase text-label-uppercase tracking-wider',
    defaultLabel: 'Sample Threshold Unmet',
  },
};

export function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  const s = STYLES[status];
  return (
    <span className={`${s.container} ${className}`}>
      {s.dot && <span className={s.dot} />}
      {label ?? s.defaultLabel}
    </span>
  );
}
