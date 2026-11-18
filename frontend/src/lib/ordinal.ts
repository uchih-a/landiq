/**
 * Ordinal suffix helper (P7b/P8b) — "1st", "2nd", "3rd", "4th", "97th".
 *
 * Presentation formatting for interpolating percentile windows into
 * copy ("the 1st–99th percentile window") from backend-served numbers
 * (flag_definition.lower_pct / upper_pct): the NUMBER always comes from
 * the response; this helper only decorates its suffix.  Handles 11th /
 * 12th / 13th correctly.
 */

export function ordinal(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const v = Math.round(Math.abs(n));
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}
