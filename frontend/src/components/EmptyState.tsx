/**
 * EmptyState — the single visual treatment for "data unavailable" / degraded mode.
 *
 * Used when a backend artifact is missing (B0's health/degraded mode) so every
 * screen has one consistent pattern instead of each screen inventing its own.
 *
 * Visual treatment per DESIGN.md:
 * - Card: ValuationCard (surface-container-lowest, 24px radius, level-1 shadow)
 * - Icon: Material Symbols in a 48px circle, surface-container background,
 *   on-surface-variant color, 32px icon size
 * - Title: headline-section (22px, weight 600, on-surface)
 * - Message: body-regular (15px, on-surface-variant)
 * - Optional action button (PillButton secondary)
 */

import { ValuationCard } from './ValuationCard';
import { PillButton } from './PillButton';

interface EmptyStateProps {
  /** Material Symbols icon name (default: "cloud_off") */
  icon?: string;
  /** Title shown below the icon */
  title: string;
  /** Descriptive message */
  message: string;
  /** Optional action button label + onClick */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon = 'cloud_off',
  title,
  message,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <ValuationCard noPadding className={`flex flex-col items-center justify-center text-center py-space-xl ${className}`}>
      <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center mb-space-md">
        <span className="material-symbols-outlined text-[28px] text-on-surface-variant">
          {icon}
        </span>
      </div>
      <h3 className="font-headline-section text-headline-section text-on-surface mb-2">
        {title}
      </h3>
      <p className="font-body-regular text-body-regular text-on-surface-variant max-w-md px-space-lg">
        {message}
      </p>
      {actionLabel && onAction && (
        <div className="mt-space-md">
          <PillButton variant="secondary" onClick={onAction} leadingIcon="refresh">
            {actionLabel}
          </PillButton>
        </div>
      )}
    </ValuationCard>
  );
}
