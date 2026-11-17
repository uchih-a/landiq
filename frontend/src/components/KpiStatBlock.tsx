/**
 * KpiStatBlock — the large 300-weight Outfit numeral + uppercase label pattern.
 *
 * Per DESIGN.md Typography section + Overview/Model Performance screens:
 * - KPI integer: display-kpi size (48px desktop / 38px mobile), weight 300, #1B1512
 * - Uppercase tracker label: label-uppercase (13px, 0.06em tracking, #6B655F)
 * - Context line: caption-sm or label-metric below in secondary
 */

interface KpiStatBlockProps {
  /** The large KPI value (number or string like "KSh 3.4M") */
  value: string | number;
  /** The uppercase label above the value */
  label: string;
  /** Optional context line below the value */
  context?: string;
  /** Optional badge text shown above the value (e.g. "Total sample", "Coverage 49%") */
  badge?: string;
  /** Use mobile typography scale (display-kpi-mobile) */
  mobile?: boolean;
  className?: string;
}

export function KpiStatBlock({
  value,
  label,
  context,
  badge,
  mobile = false,
  className = '',
}: KpiStatBlockProps) {
  const valueClass = mobile ? 'text-display-kpi-mobile' : 'text-display-kpi';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {badge && (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary text-xs font-medium">
            {badge}
          </span>
        </div>
      )}
      <div
        className={`font-outfit ${valueClass} text-on-surface font-light tracking-tight`}
        style={{ fontWeight: 300 }}
      >
        {value}
      </div>
      {label && (
        <p className="text-label-uppercase font-label-uppercase text-secondary uppercase">
          {label}
        </p>
      )}
      {context && <p className="text-caption-sm font-caption-sm text-secondary">{context}</p>}
    </div>
  );
}
