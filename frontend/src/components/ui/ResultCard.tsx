import { Bookmark, Share2 } from 'lucide-react';
import { cn, formatKES, formatNumber } from '@/lib/utils';
import type { PredictionResponse } from '@/types';

interface ResultCardProps {
  prediction: PredictionResponse;
}

export function ResultCard({ prediction }: ResultCardProps) {
  const {
    county,
    geocode_source,
    size_acres,
    price_per_acre_ksh,
    price_total_ksh,
    price_low_ksh,
    price_high_ksh,
  } = prediction;

  const confidencePercent = 82; // This would come from the API

  return (
    <div className="card border-l-4 border-l-sienna">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-2">
          {county && (
            <span className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {county}
              {geocode_source && (
                <span className="badge-grey text-xs ml-2">{geocode_source}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-green text-xs">MLP</span>
          <button className="p-2 hover:bg-[var(--surface)] rounded-lg transition-colors">
            <Share2 className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
          <button className="p-2 hover:bg-[var(--surface)] rounded-lg transition-colors">
            <Bookmark className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
        </div>
      </div>

      {/* Price */}
      <div className="mb-6">
        <p className="text-sm text-[var(--text-muted)] uppercase tracking-wide mb-1">
          Estimated Market Value
        </p>
        <p className="price-large text-3xl md:text-4xl">
          {formatKES(price_total_ksh)}
        </p>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Total for {size_acres.toFixed(2)} acres
        </p>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1">
            Unit Price
          </p>
          <p className="font-mono font-medium text-[var(--text-primary)]">
            {formatKES(price_per_acre_ksh)} / acre
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1">
            Confidence Band
          </p>
          <p className="font-mono font-medium text-[var(--text-primary)]">
            ±30% ({formatKES(price_low_ksh)} - {formatKES(price_high_ksh)})
          </p>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="border-t border-[var(--border)] pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[var(--text-muted)]">LOW VOLATILITY</span>
          <span className="text-xs text-[var(--text-muted)]">HIGH VOLATILITY</span>
        </div>
        <div className="h-2 bg-[var(--surface)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${confidencePercent}%`,
              background: `linear-gradient(90deg, #DC2626 0%, #A8C5A0 50%, #F59E0B 100%)`,
            }}
          />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-2">
          Estimated confidence range based on comparable listings
        </p>
      </div>

      {/* Beta Warning */}
      <div className="mt-4 p-3 bg-amber/10 border border-amber/20 rounded-lg">
        <p className="text-xs text-amber-dark dark:text-amber">
          ⚠ Beta estimate. Conduct full due diligence before any transaction.
        </p>
      </div>
    </div>
  );
}
