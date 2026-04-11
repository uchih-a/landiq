import { cn } from '@/lib/utils';

interface TabToggleProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function TabToggle<T extends string>({
  options,
  value,
  onChange,
}: TabToggleProps<T>) {
  return (
    <div className="tab-toggle">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'tab-toggle-item',
            value === option.value && 'active'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
