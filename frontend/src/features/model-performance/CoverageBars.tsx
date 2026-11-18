/**
 * CoverageBars — the "Do ranges hold?" card (P5b real-data round).
 *
 * Fix D: the nominal levels (0.5 / 0.8 / 0.9) and the labels ("50%
 * range" etc.) are NO LONGER typed — they come from the response's
 * `interval_levels` (backend-derived from the artifact's
 * interval_coverage_weighted_ensemble entries or the ensemble row's
 * populated coverage columns).  The bars build from
 * `coverageEntriesFor(metrics)`; no fixed target array remains.
 */
import { useTranslation } from 'react-i18next';
import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { MetricsResponse } from '@/lib/api/types';

import { coverageEntriesFor } from './metrics-helpers';

interface Props {
  metrics: MetricsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function CoverageBars({ metrics, isLoading, isError, onRetry }: Props) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-48 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title={t('common.dataUnavailable')}
        message={t('model.coverageLoadFailed')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }

  const entries = coverageEntriesFor(metrics);
  if (entries.length === 0 || entries.every((e) => e.actual == null)) {
    return (
      <EmptyState
        icon="tune"
        title={t('model.noCoverageTitle')}
        message={t('model.noCoverageMessage')}
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('model.doRangesHold')}
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {t('model.doRangesHoldSubtitle')}
        </p>

        {/* Visually hidden table with target vs actual (a11y — the target
            tick is not the only carrier of the information). */}
        <div className="sr-only">
        <table>
          <caption>{t('model.doRangesHold')}</caption>
          <thead>
            <tr>
              <th>{t('model.colRange')}</th>
              <th>{t('model.colTarget')}</th>
              <th>{t('model.colActual')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.level}>
                <td>{t('model.rangeLabel', { pct: e.targetPct })}</td>
                <td>{e.targetPct}%</td>
                <td>{e.actual != null ? `${(e.actual * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="mt-space-md flex flex-col gap-4">
          {entries.map((e) => {
            const actualPct = e.actual != null ? Math.round(e.actual * 100) : null;
            const barWidth = actualPct != null ? Math.min(100, actualPct) : 0;
            return (
              <div key={e.level} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-regular text-on-surface">
                    {/* Level label templated from the response's level. */}
                    {t('model.rangeLabel', { pct: e.targetPct })}
                  </span>
                  <span className="text-label-metric font-label-metric text-on-surface-variant tabular-nums">
                    {actualPct != null ? `${actualPct}%` : '—'}{' '}
                    <span className="text-secondary">
                      {t('model.targetSuffix', { pct: e.targetPct })}
                    </span>
                  </span>
                </div>
                <div className="relative h-3 w-full rounded-full bg-surface-container-highest">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-market-opportunity transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                    role="presentation"
                  />
                  {/* Target tick. */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 bg-on-surface"
                    style={{ left: `${e.targetPct}%` }}
                    title={t('model.targetTitle', { pct: e.targetPct })}
                    aria-label={t('model.targetA11y', { pct: e.targetPct })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ValuationCard>
  );
}
