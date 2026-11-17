/**
 * GlossaryPanel — the F8 "Glossary" card.
 *
 * Renders every entry in the explainability payload's `feature_labels`
 * map: feature key, human label, unit, and the long-form description.
 * The list is capped with a scroll container (`max-h-96 overflow-y-auto`)
 * so a large feature set doesn't blow out the screen height.
 */
import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { FeatureLabel } from '@/lib/api/types';

interface Props {
  labels: Record<string, FeatureLabel> | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function GlossaryPanel({ labels, isLoading, isError, onRetry }: Props) {
  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-64 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title="Couldn't load glossary"
        message="The feature labels feed is unavailable."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }

  const entries = labels ? Object.entries(labels) : [];
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="menu_book"
        title="No feature labels"
        message="The explainability payload did not include a feature_labels map."
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          Glossary
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          Every model feature with its label, unit, and description.
        </p>
        <ul
          className="mt-space-md flex flex-col gap-3 max-h-96 overflow-y-auto"
          role="list"
        >
          {entries.map(([key, fl]) => (
            <li
              key={key}
              className="border-b border-black/[0.04] pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body-medium font-body-medium text-on-surface">
                    {fl.label}
                  </span>
                  {fl.unit && (
                    <span className="text-caption-sm text-secondary">
                      {fl.unit}
                    </span>
                  )}
                </div>
                <code className="text-caption-sm text-secondary">{key}</code>
                {fl.description && (
                  <p className="mt-1 text-body-regular text-on-surface-variant">
                    {fl.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ValuationCard>
  );
}
