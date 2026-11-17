/**
 * ScoreRing — circular gauge for Amenities/Accessibility/Infrastructure scores.
 *
 * Two visual states per the predictor screens:
 * - Full-color (reliable): ring stroke = the `color` prop (defaults to
 *   primary-container #E8742A). Per 02_predictor_reliable/code.html, each
 *   ring uses a DIFFERENT color: Amenities=primary-container, Accessibility
 *   =primary (#9D4400), Infrastructure=#E3A008 (market-caution amber).
 * - Muted (insufficient data): ring stroke = secondary (#6a5b56),
 *   label below in secondary, value shows "—" or the partial score.
 *
 * SVG geometry from the design files:
 * - cx=24, cy=24, r=20 (viewBox 0 0 48 48)
 * - circumference = 2 * π * 20 ≈ 125.66
 * - stroke-dasharray = circumference
 * - stroke-dashoffset = circumference * (1 - score/100)
 * - stroke-linecap = round
 */

interface ScoreRingProps {
  /** Score 0-100 (or null for insufficient data) */
  score: number | null;
  /** Label below the ring (e.g. "Amenities") */
  label: string;
  /** Size in px (default 48 — matches the design's cx/cy/r) */
  size?: number;
  /** Ring stroke color when score is present (hex string).
   *  Per the design, each ring uses a different color. Defaults to
   *  primary-container #E8742A for backwards compatibility. */
  color?: string;
}

export function ScoreRing({ score, label, size = 48, color = '#E8742A' }: ScoreRingProps) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const hasScore = score !== null && score !== undefined && !isNaN(score);
  const offset = hasScore ? circumference * (1 - (score as number) / 100) : circumference * 0.75;

  // Full-color state: caller-specified color. Muted: secondary stroke.
  const ringColor = hasScore ? color : '#6a5b56';
  const trackColor = '#eae1d9'; // surface-container-highest
  const valueColor = hasScore ? 'text-on-surface' : 'text-secondary';
  const labelColor = hasScore ? 'text-secondary' : 'text-secondary';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 48 48" className="overflow-visible">
        {/* Track */}
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="transparent"
          stroke={trackColor}
          strokeWidth="4"
        />
        {/* Score arc */}
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="transparent"
          stroke={ringColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* Value text in center */}
        <text
          x="24"
          y="24"
          textAnchor="middle"
          dominantBaseline="central"
          className={`fill-current ${valueColor}`}
          style={{ fontSize: '13px', fontWeight: 500, fontFamily: 'Outfit' }}
        >
          {hasScore ? score : '—'}
        </text>
      </svg>
      <span className={`text-caption-sm font-caption-sm ${labelColor}`}>{label}</span>
    </div>
  );
}
