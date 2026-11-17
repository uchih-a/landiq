/**
 * ValuationCard — the base card used everywhere in the app.
 *
 * Per DESIGN.md Elevation section:
 * - Surface: #FBFBFA (surface-container-lowest)
 * - 24px corner radius (rounded-lg = 2rem in our theme)
 * - 1px hairline border: rgba(27, 21, 18, 0.06)
 * - Level 1 shadow: 0 1px 2px rgba(27,21,18,0.02), 0 8px 24px -4px rgba(27,21,18,0.04)
 * - Interior padding defaults to space-lg (28px)
 */
import { ReactNode } from 'react';

interface ValuationCardProps {
  children: ReactNode;
  className?: string;
  /** Hover elevation (Level 2) — shifts to the stronger shadow + primary border tint */
  hoverable?: boolean;
  /** Remove default padding (for cards that manage their own internal layout) */
  noPadding?: boolean;
}

export function ValuationCard({
  children,
  className = '',
  hoverable = false,
  noPadding = false,
}: ValuationCardProps) {
  const base =
    'rounded-lg bg-surface-container-lowest border border-black/[0.06] shadow-level-1 transition-all duration-200';
  const hover = hoverable
    ? 'hover:shadow-level-2 hover:border-primary-container/25 cursor-pointer'
    : '';
  const pad = noPadding ? '' : 'p-space-lg';

  return <div className={`${base} ${hover} ${pad} ${className}`}>{children}</div>;
}
