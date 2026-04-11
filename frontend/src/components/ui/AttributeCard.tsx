import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeatureBreakdown } from '@/types';

interface AttributeCardProps {
  features: FeatureBreakdown[];
}

export function AttributeCard({ features }: AttributeCardProps) {
  return (
    <div className="card">
      <h3 className="font-serif font-semibold text-lg text-[var(--text-primary)] mb-4">
        What drove this estimate?
      </h3>

      <div className="space-y-3">
        {features.map((feature, index) => (
          <FeatureRow key={index} feature={feature} />
        ))}
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-4 pt-4 border-t border-[var(--border)]">
        * Water body distance estimated from county median where exact measurement unavailable.
      </p>
    </div>
  );
}

function FeatureRow({ feature }: { feature: FeatureBreakdown }) {
  const { name, value, unit, influence, direction } = feature;

  const getInfluenceBadge = () => {
    if (influence === 'High') {
      return (
        <span className="badge-green text-xs flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> High
        </span>
      );
    }
    if (influence === 'Moderate') {
      return (
        <span className="badge-amber text-xs flex items-center gap-1">
          <Minus className="h-3 w-3" /> Moderate
        </span>
      );
    }
    if (influence === 'Low') {
      return (
        <span className="badge-grey text-xs flex items-center gap-1">
          <TrendingDown className="h-3 w-3" /> Low
        </span>
      );
    }
    return (
      <span className="badge-grey text-xs flex items-center gap-1">
        <Minus className="h-3 w-3" /> Neutral
      </span>
    );
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{name}</p>
        <p className="text-xs text-[var(--text-muted)]">
          {value} {unit}
        </p>
      </div>
      {getInfluenceBadge()}
    </div>
  );
}
