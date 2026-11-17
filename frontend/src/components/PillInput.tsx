/**
 * PillInput — 48px height, continuous pill geometry, inset shadow, focus ring.
 *
 * Per DESIGN.md Inputs & Form Elements section:
 * - Height: 48px
 * - Background: #FFFFFF (surface-container-lowest)
 * - Inset shadow: inset 0 1px 2px rgba(27, 21, 18, 0.03)
 * - Focus ring: 2px solid #E8742A (primary-container)
 * - Shape: continuous pill (rounded-full)
 */
import { InputHTMLAttributes, forwardRef } from 'react';

interface PillInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional leading icon (Material Symbols name) */
  leadingIcon?: string;
  /** Optional trailing icon (Material Symbols name) */
  trailingIcon?: string;
}

export const PillInput = forwardRef<HTMLInputElement, PillInputProps>(
  ({ leadingIcon, trailingIcon, className = '', ...props }, ref) => {
    return (
      <div className="relative inline-flex items-center w-full">
        {leadingIcon && (
          <span className="material-symbols-outlined text-[20px] text-secondary absolute left-4 pointer-events-none">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          className={`
            h-12 w-full rounded-full bg-surface-container-lowest
            border border-black/[0.06]
            shadow-[inset_0_1px_2px_rgba(27,21,18,0.03)]
            text-body-regular text-on-surface
            placeholder:text-secondary
            focus:outline-none focus:ring-2 focus:ring-primary-container
            transition-all duration-150
            ${leadingIcon ? 'pl-12' : 'pl-5'}
            ${trailingIcon ? 'pr-12' : 'pr-5'}
            ${className}
          `}
          {...props}
        />
        {trailingIcon && (
          <span className="material-symbols-outlined text-[20px] text-secondary absolute right-4 pointer-events-none">
            {trailingIcon}
          </span>
        )}
      </div>
    );
  },
);

PillInput.displayName = 'PillInput';
