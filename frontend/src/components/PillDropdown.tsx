/**
 * PillDropdown — filter/dropdown selector pill.
 *
 * Per DESIGN.md: secondary pill shape (off-white bg, hairline border),
 * text in #1B1512, trailing micro-chevron icon.
 * Used for the "Filter County", "Filter Property type" selectors on Overview.
 */
import { useState, useRef, useEffect } from 'react';

interface PillDropdownProps {
  /** Label shown on the pill button */
  label: string;
  /** Optional leading icon (Material Symbols name) */
  leadingIcon?: string;
  /** Dropdown options */
  options: { value: string; label: string }[];
  /** Current value */
  value?: string;
  /** Callback when an option is selected */
  onChange?: (value: string) => void;
}

export function PillDropdown({
  label,
  leadingIcon,
  options,
  value,
  onChange,
}: PillDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? label;

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container-low transition-colors duration-150 text-body-medium font-body-medium cursor-pointer"
      >
        {leadingIcon && (
          <span className="material-symbols-outlined text-[18px] text-secondary">
            {leadingIcon}
          </span>
        )}
        <span>{selectedLabel}</span>
        <span className="material-symbols-outlined text-[18px] text-secondary">
          keyboard_arrow_down
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 min-w-[12rem] rounded-DEFAULT bg-surface-container-lowest shadow-level-2 border border-black/[0.06] py-1 z-50">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange?.(opt.value);
                setOpen(false);
              }}
              className={`
                block w-full text-left px-4 py-2 text-body-regular transition-colors
                ${opt.value === value ? 'bg-surface-container text-on-surface font-body-medium' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
