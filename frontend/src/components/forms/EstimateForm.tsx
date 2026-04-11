import { useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { cn, getScoreBadgeVariant } from '@/lib/utils';

interface EstimateFormProps {
  onSubmit: (data: {
    location_text: string;
    size_acres: number;
    amenity_score: number;
    accessibility_score: number;
    infrastructure_score: number;
  }) => void;
  isLoading: boolean;
}

const KENYA_COUNTIES = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa',
  'Homa Bay', 'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi',
  'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu',
  'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa',
  "Murang'a", 'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua',
  'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River', 'Tharaka-Nithi',
  'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
];

export function EstimateForm({ onSubmit, isLoading }: EstimateFormProps) {
  const [useCountySelect, setUseCountySelect] = useState(false);
  const [locationText, setLocationText] = useState('');
  const [selectedCounty, setSelectedCounty] = useState('');
  const [sizeAcres, setSizeAcres] = useState('2.5');
  const [unit, setUnit] = useState<'acres' | 'hectares'>('acres');
  const [amenityScore, setAmenityScore] = useState(50);
  const [accessibilityScore, setAccessibilityScore] = useState(50);
  const [infrastructureScore, setInfrastructureScore] = useState(50);

  const sizeInAcres = unit === 'hectares' 
    ? parseFloat(sizeAcres || '0') * 2.47105 
    : parseFloat(sizeAcres || '0');

  const isValid = useCountySelect 
    ? selectedCounty && sizeInAcres > 0
    : locationText.trim().length >= 2 && sizeInAcres > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isLoading) return;

    onSubmit({
      location_text: useCountySelect ? selectedCounty : locationText,
      size_acres: sizeInAcres,
      amenity_score: amenityScore,
      accessibility_score: accessibilityScore,
      infrastructure_score: infrastructureScore,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-6">
      {/* Location */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            Property Location
          </label>
          <button
            type="button"
            onClick={() => setUseCountySelect(!useCountySelect)}
            className="text-xs text-sienna hover:underline"
          >
            {useCountySelect ? '← Use Plus Code instead' : 'Switch to County Toggle'}
          </button>
        </div>

        {useCountySelect ? (
          <select
            value={selectedCounty}
            onChange={(e) => setSelectedCounty(e.target.value)}
            className="input-field"
          >
            <option value="">Select a county</option>
            {KENYA_COUNTIES.map((county) => (
              <option key={county} value={county}>
                {county}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="Enter Plus Code or Landmark (e.g., 6G3V+5X Limuru)"
            className="input-field"
          />
        )}

        <p className="text-xs text-[var(--text-muted)] mt-2">
          {useCountySelect
            ? 'County-level estimates are less precise than Plus Code estimates'
            : 'Google Plus Codes provide the most precise location. Find yours at plus.codes'}
        </p>
      </div>

      {/* Plot Size */}
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)] mb-2">
          Plot Size
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0.05"
            max="50000"
            value={sizeAcres}
            onChange={(e) => setSizeAcres(e.target.value)}
            className="input-field flex-1"
          />
          <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setUnit('acres')}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                unit === 'acres'
                  ? 'bg-forest text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
              )}
            >
              Acres
            </button>
            <button
              type="button"
              onClick={() => setUnit('hectares')}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                unit === 'hectares'
                  ? 'bg-forest text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
              )}
            >
              Hectares
            </button>
          </div>
        </div>
        {unit === 'hectares' && sizeAcres && (
          <p className="text-xs text-[var(--text-muted)] mt-2">
            = {sizeInAcres.toFixed(2)} acres
          </p>
        )}
      </div>

      {/* Environmental Anchors */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-serif font-semibold text-lg text-[var(--text-primary)]">
            Environmental Anchors
          </h3>
          <div className="group relative">
            <Info className="h-4 w-4 text-[var(--text-muted)] cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-elevated text-xs text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Adjust these scores to match your property. Higher = better.
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <SliderField
            label="Local Amenities"
            description="Proximity to hospitals, schools, markets, banks, and public transport"
            minLabel="Sparse"
            maxLabel="Densely Integrated"
            value={amenityScore}
            onChange={setAmenityScore}
          />

          <SliderField
            label="Accessibility & Roads"
            description="Road network quality and proximity to major urban centres"
            minLabel="Unpaved"
            maxLabel="Dual Carriage"
            value={accessibilityScore}
            onChange={setAccessibilityScore}
          />

          <SliderField
            label="Digital Infrastructure"
            description="On-site infrastructure (stored for reference; not used in the current model)"
            minLabel="Offline"
            maxLabel="Fiber Enabled"
            value={infrastructureScore}
            onChange={setInfrastructureScore}
          />
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!isValid || isLoading}
        className="w-full btn-primary py-4 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Analysing...
          </>
        ) : (
          <>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            Recalculate Valuation
          </>
        )}
      </button>
    </form>
  );
}

interface SliderFieldProps {
  label: string;
  description: string;
  minLabel: string;
  maxLabel: string;
  value: number;
  onChange: (value: number) => void;
}

function SliderField({
  label,
  description,
  minLabel,
  maxLabel,
  value,
  onChange,
}: SliderFieldProps) {
  const variant = getScoreBadgeVariant(value);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-[var(--text-primary)]">
          {label}
        </label>
        <span
          className={cn(
            'badge text-xs',
            variant === 'green' && 'badge-green',
            variant === 'amber' && 'badge-amber',
            variant === 'red' && 'badge-red'
          )}
        >
          {value} / 100
        </span>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-3">{description}</p>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="slider"
        style={{
          background: `linear-gradient(to right, var(--border) 0%, var(--border) ${value}%, var(--forest) ${value}%, var(--forest) 100%)`,
        }}
      />
      <div className="flex justify-between mt-2 text-xs text-[var(--text-muted)]">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}
