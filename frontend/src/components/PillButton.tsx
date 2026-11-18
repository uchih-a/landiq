/**
 * PillButton — full-pill-shaped button with primary (filled) and secondary (outline) variants.
 *
 * Per DESIGN.md Buttons & Selectors section + Earth Accent Scale:
 * - Primary: filled with #E8742A (primary-container), text #FFFFFF (on-primary)
 *   Hover: #B04A0E (earth-dark — the "Dark" accent variant).
 *   Pressed/active: #7A3208 (earth-deep — the "Deep" accent variant).
 *   Focus ring: 3px solid #FDE4D1 (primary-fixed).
 * - Secondary: off-white #FBFBFA background, 1px hairline border rgba(27,21,18,0.1)
 *   Text #1B1512 (on-surface). Contains trailing micro-chevron for dropdowns.
 * - Shape: continuous rounded pill (9999px / rounded-full)
 */
import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
  /** Optional leading icon (Material Symbols name) */
  leadingIcon?: string;
  /** Optional trailing icon (Material Symbols name) */
  trailingIcon?: string;
}

export function PillButton({
  variant = 'primary',
  children,
  leadingIcon,
  trailingIcon,
  className = '',
  ...props
}: PillButtonProps) {
  const base =
    'inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-body-medium font-body-medium transition-all duration-200 focus:outline-none focus:ring-[3px] focus:ring-primary-fixed disabled:opacity-50 disabled:cursor-not-allowed';

  const variants: Record<Variant, string> = {
    primary:
      'bg-primary-container text-on-primary shadow-md hover:bg-earth-dark hover:shadow-lg active:bg-earth-deep',
    secondary:
      'bg-surface-container-lowest text-on-surface border border-black/10 shadow-sm hover:bg-surface-container-low active:bg-surface-container',
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {leadingIcon && (
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      {children}
      {trailingIcon && (
        <span className="material-symbols-outlined text-[18px] text-secondary" aria-hidden="true">
          {trailingIcon}
        </span>
      )}
    </button>
  );
}
