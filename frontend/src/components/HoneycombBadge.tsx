/**
 * HoneycombBadge — hexagonal badge for confidence/tier ratings.
 *
 * Per DESIGN.md Shapes section:
 * - 32px × 36px hexagon
 * - clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)
 * - Default Background: bg-primary-fixed (#ffdbca, matching the frontmatter
 *   primary-fixed token; DESIGN.md prose says #FDE4D1 but labels it
 *   "primary-fixed" — the frontmatter value wins per the design HTML).
 * - Default Text: #7A3208 (a deep burnt-orange for high-contrast on pale
 *   surfaces)
 * - Used for land index confidence ratings and regional tier categorizations
 *
 * The `bgClass` and `textClass` props allow callers to override the default
 * colors for tier-based visualizations (e.g. CountyHexViz uses darker
 * oranges for higher-ranked counties, matching 01_overview/code.html's
 * SVG honeycomb which fills Nairobi #9d4400, Kiambu #e8742a, Kajiado
 * #ffb68f, others #dec1b3).
 */

interface HoneycombBadgeProps {
  /** The short label inside the badge (1-2 chars, e.g. "A", "B+", "T1") */
  children: string;
  /** Override the background Tailwind class (e.g. 'bg-primary') */
  bgClass?: string;
  /** Override the text color Tailwind class (e.g. 'text-white') */
  textClass?: string;
  className?: string;
}

export function HoneycombBadge({
  children,
  bgClass = 'bg-primary-fixed',
  textClass = 'text-[#7A3208]',
  className = '',
}: HoneycombBadgeProps) {
  return (
    <div
      className={`inline-flex items-center justify-center w-8 h-9 text-label-metric font-label-metric ${bgClass} ${textClass} ${className}`}
      style={{
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
      }}
    >
      {children}
    </div>
  );
}
