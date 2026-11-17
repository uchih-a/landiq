/**
 * HealthBanner — sticky top banner that flips on when the backend reports
 * `status === 'degraded'`.
 *
 * Behaviour:
 * - Polls `/health` via `useHealth()` (30s interval set in the hook).
 * - Shows when the latest response is `degraded` (artifacts not all loaded).
 * - Dismissible via the close button. The dismissal is keyed to the
 *   specific poll (`dataUpdatedAt`) that produced the degraded status —
 *   when the next poll comes back as degraded again, `dataUpdatedAt`
 *   bumps and the banner reappears. This matches the F2 spec: "Dismissible
 *   (but reappears if health re-checks as degraded)".
 * - When health comes back `ok`, the dismissed state is cleared so the
 *   banner will fire again the next time the backend degrades.
 *
 * Visual treatment per DESIGN.md's market-status signals:
 * - Background: `bg-market-caution/10` (amber wash, 10% alpha)
 * - Text + icon: `text-market-caution`
 * - Icon: `warning` Material Symbols Outlined
 * - Body: copy per spec — "Data may be incomplete — some model files are
 *   not loaded".
 *
 * Layout:
 * - Fixed to the very top of the viewport (z-50) so it sits above the
 *   LayoutShell's top app bar. The app bar is `top-0 h-16 md:h-20`; we
 *   render the banner above it and push the app bar down by the banner's
 *   own height via `top-[var(--health-banner-h)]` — but to keep this
 *   self-contained and not touch the LayoutShell (F1 constraint), we
 *   instead render the banner as a flow element at the top of the
 *   `<body>` so the app bar simply scrolls with it. Sticky positioning
 *   keeps it visible while scrolling through long content (e.g. tables).
 */

import { useEffect, useState } from 'react';

import { useHealth } from '@/lib/api/hooks';

interface HealthBannerProps {
  /** Optional override of the message copy (e.g. for i18n). */
  message?: string;
  className?: string;
}

const DEFAULT_MESSAGE =
  'Data may be incomplete — some model files are not loaded';

export function HealthBanner({
  message = DEFAULT_MESSAGE,
  className = '',
}: HealthBannerProps) {
  const { data, isSuccess, dataUpdatedAt } = useHealth();
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  // Reset the dismissal whenever a fresh poll lands — so the next
  // degraded status re-triggers the banner even if the previous one was
  // dismissed. (The previous behaviour — dismissed forever — would mask
  // a real degradation that flips back on after a transient `ok`.)
  useEffect(() => {
    setDismissedAt((prev) => {
      // Only invalidate the dismissal if a newer poll has arrived.
      if (prev === null) return prev;
      if (dataUpdatedAt > prev) return null;
      return prev;
    });
  }, [dataUpdatedAt]);

  // Hide when:
  //   - the query hasn't returned yet (no banner flash on initial mount)
  //   - the latest status is OK
  //   - OR this specific poll was dismissed
  const isDegraded = isSuccess && data?.status === 'degraded';
  const isDismissed = dismissedAt !== null && dismissedAt >= dataUpdatedAt;
  const shouldShow = isDegraded && !isDismissed;

  if (!shouldShow) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-50 w-full flex items-center gap-3 px-4 py-2.5 md:px-margin md:py-3 bg-market-caution/10 text-market-caution border-b border-market-caution/20 ${className}`}
    >
      <span
        className="material-symbols-outlined text-[20px] flex-shrink-0"
        aria-hidden="true"
      >
        warning
      </span>
      <p className="text-body-regular font-body-medium flex-1 min-w-0">
        {message}
      </p>
      <button
        type="button"
        onClick={() => setDismissedAt(dataUpdatedAt)}
        aria-label="Dismiss health warning"
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-market-caution/15 focus:outline-none focus:ring-2 focus:ring-market-caution/40 transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  );
}

export default HealthBanner;
