/**
 * GlossaryPanel — the "Glossary" card.
 *
 * P6b: the glossary lists ONLY the features present in the model — the
 * feature set is the union of features in `shap_global` (the rows the
 * bars card charts), passed in as `modelFeatureKeys`.  The full
 * feature_labels catalogue (which includes Phase-3 features with
 * in_production_set=false that the production model does not use) is
 * filtered down, and the caption interpolates the actual count.
 *
 * The list is capped with a scroll container (`max-h-96
 * overflow-y-auto`) — an accepted UI constant (display density, not a
 * data fact).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import type { FeatureLabel } from '@/lib/api/types';

interface Props {
  labels: Record<string, FeatureLabel> | undefined;
  /** Feature keys the model actually uses (from shap_global rows). */
  modelFeatureKeys: Set<string> | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function GlossaryPanel({ labels, modelFeatureKeys, isLoading, isError, onRetry }: Props) {
  const { t } = useTranslation();

  const entries = useMemo(() => {
    const all = labels ? Object.entries(labels) : [];
    if (!modelFeatureKeys) return all;
    return all.filter(([key]) => modelFeatureKeys.has(key));
  }, [labels, modelFeatureKeys]);

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
        title={t('explain.glossaryLoadFailed')}
        message={t('explain.glossaryUnavailable')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="menu_book"
        title={t('explain.glossaryEmpty')}
        message={t('explain.glossaryEmptyMessage')}
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('explain.glossary')}
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {t('explain.glossaryCaption', { n: entries.length })}
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
                    <span className="text-caption-sm text-secondary">{fl.unit}</span>
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
