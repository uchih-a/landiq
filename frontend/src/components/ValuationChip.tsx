/**
 * ValuationChip — pill badges with a 6px circular semantic indicator dot.
 *
 * Per DESIGN.md Chips & Micro-Badges section:
 * - Underpriced: Surface rgba(47, 158, 95, 0.1), Text #2F9E5F (market-opportunity)
 * - Overpriced: Surface rgba(214, 69, 93, 0.1), Text #D6455D (market-overvalued)
 * - Constrained Volume: Surface rgba(227, 160, 8, 0.12), Text #E3A008 (market-caution)
 * - Pill shape (rounded-full), 6px dot indicator, label-metric typography
 */
export type Verdict = 'underpriced' | 'overpriced' | 'constrained' | 'fair';

interface ValuationChipProps {
  verdict: Verdict;
  /** Optional custom label (defaults to the verdict capitalized) */
  label?: string;
  /** Optional count or percentage to show after the label */
  count?: string | number;
  className?: string;
}

const STYLES: Record<Verdict, { dot: string; bg: string; text: string; defaultLabel: string }> = {
  underpriced: {
    dot: 'bg-market-opportunity',
    bg: 'bg-[rgba(47,158,95,0.1)]',
    text: 'text-market-opportunity',
    defaultLabel: 'Underpriced',
  },
  overpriced: {
    dot: 'bg-market-overvalued',
    bg: 'bg-[rgba(214,69,93,0.1)]',
    text: 'text-market-overvalued',
    defaultLabel: 'Overpriced',
  },
  constrained: {
    dot: 'bg-market-caution',
    bg: 'bg-[rgba(227,160,8,0.12)]',
    text: 'text-market-caution',
    defaultLabel: 'Constrained',
  },
  fair: {
    dot: 'bg-secondary',
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface',
    defaultLabel: 'Fair',
  },
};

export function ValuationChip({ verdict, label, count, className = '' }: ValuationChipProps) {
  const s = STYLES[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-metric font-label-metric ${s.bg} ${s.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label ?? s.defaultLabel}
      {count !== undefined && <span className="opacity-70 ml-0.5">{count}</span>}
    </span>
  );
}
