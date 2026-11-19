/**
 * DealSignalsCard — narrow (4/12) card on the Overview grid.
 *
 * O2 build round:
 *  - Counts + shares + stacked bar come from `overview.verdicts` (the
 *    whole-corpus tally the backend owns, no client-side counting).
 *  - Anomaly note from `overview.totals.n_flagged`: pluralised correctly,
 *    hidden when 0, links to Deal Finder with `flagged=true`.
 *  - Sync button = refetch (spinning state via isFetching).
 *  - Each verdict tile is a link to Deal Finder filtered by that verdict
 *    (and the active county / prop_type).
 *  - Card height fills to match the wide price-distance card so it no
 *    longer leaves a blank half.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { OverviewSummaryResponse } from '@/lib/api/types';

import { ALL_VALUE, buildDealFinderUrl } from './overview-helpers';

interface DealSignalsCardProps {
  overview: OverviewSummaryResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  county: string;
  propType: string;
}

const UNDER_COLOR = 'bg-tertiary';
const FAIR_COLOR = 'bg-secondary';
const OVER_COLOR = 'bg-error';

export function DealSignalsCard({
  overview,
  isLoading,
  isError,
  onRetry,
  county,
  propType,
}: DealSignalsCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const verdicts = overview?.verdicts;
  const nFlagged = overview?.totals.n_flagged ?? 0;

  const segments = useMemo(() => {
    if (!verdicts || verdicts.n_listings === 0) return [];
    const total = verdicts.n_listings;
    return [
      {
        key: 'underpriced' as const,
        label: t('overview.under'),
        count: verdicts.underpriced,
        sharePct: Math.round((verdicts.underpriced / total) * 1000) / 10,
        color: UNDER_COLOR,
      },
      {
        key: 'fair' as const,
        label: t('overview.fairMarket'),
        count: verdicts.fair,
        sharePct: Math.round((verdicts.fair / total) * 1000) / 10,
        color: FAIR_COLOR,
      },
      {
        key: 'overpriced' as const,
        label: t('overview.over'),
        count: verdicts.overpriced,
        sharePct: Math.round((verdicts.overpriced / total) * 1000) / 10,
        color: OVER_COLOR,
      },
    ];
  }, [verdicts, t]);

  return (
    <ValuationCard className="lg:col-span-4" noPadding>
      <div className="p-space-lg h-full flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-headline-section text-headline-section text-on-surface">
              {t('overview.dealSignals')}
            </h2>
            <p className="text-body-regular font-body-regular text-secondary mt-0.5">
              {t('overview.askingVsEstimate')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRetry()}
            title={t('overview.refreshSignals')}
            aria-label={t('overview.refreshSignals')}
            className="w-9 h-9 rounded-full bg-surface-container-low text-on-surface-variant hover:text-primary flex items-center justify-center shrink-0 transition-colors"
          >
            <span
              className={`material-symbols-outlined text-[18px] ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            >
              sync
            </span>
          </button>
        </div>

        {isLoading ? (
          <LoadingSkeleton className="h-32 w-full rounded-md flex-1" />
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title={t('common.error')}
            message={t('common.dataUnavailable')}
            actionLabel={t('common.retry')}
            onAction={onRetry}
          />
        ) : !verdicts || verdicts.n_listings === 0 ? (
          <EmptyState icon="insights" title={t('overview.emptySelection')} message="" />
        ) : (
          <>
            {/* Stacked bar */}
            <div
              className="w-full h-6 rounded-full overflow-hidden flex bg-surface-container-high shadow-inner"
              role="img"
              aria-label={t('overview.askingVsEstimate')}
            >
              {segments.map((s) => (
                <div
                  key={s.key}
                  className={`h-full ${s.color} transition-all duration-500 hover:opacity-90`}
                  style={{ width: `${s.sharePct}%` }}
                  title={`${s.label}: ${s.sharePct}%`}
                />
              ))}
            </div>

            {/* Three count tiles */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {segments.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() =>
                    navigate(
                      buildDealFinderUrl({
                        county: county !== ALL_VALUE ? county : null,
                        propType: propType !== ALL_VALUE ? propType : null,
                        verdict: s.key,
                      }),
                    )
                  }
                  className="flex flex-col gap-1 p-2 rounded-DEFAULT bg-surface-container-low text-left hover:bg-surface-container transition-colors focus:outline-none focus:ring-2 focus:ring-primary-container"
                  aria-label={`${s.label}: ${s.count} listings — view in Deal Finder`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${s.color}`} aria-hidden="true" />
                    <span className="text-xs text-secondary font-medium">{s.label}</span>
                  </div>
                  <span className="font-headline-section text-headline-section text-on-surface">
                    {s.count}
                  </span>
                  <span className="text-xs text-secondary">
                    {t('overview.sampleShare', { pct: s.sharePct.toFixed(1) })}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-xs text-secondary font-body-regular pt-3">
              {t('overview.askingVsEstimate')}
            </p>

            {/* Anomaly note — hidden when 0 */}
            {nFlagged > 0 && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    buildDealFinderUrl({
                      county: county !== ALL_VALUE ? county : null,
                      propType: propType !== ALL_VALUE ? propType : null,
                      flagged: true,
                    }),
                  )
                }
                className="mt-auto flex items-center gap-2.5 p-3 rounded-DEFAULT bg-surface-container-low text-secondary text-xs font-body-medium hover:bg-surface-container transition-colors focus:outline-none focus:ring-2 focus:ring-primary-container"
                aria-label={t('overview.anomaliesViewInDealFinder')}
              >
                <span
                  className="material-symbols-outlined text-[18px] text-primary-container shrink-0"
                  aria-hidden="true"
                >
                  error_outline
                </span>
                <span className="truncate">
                  {t('overview.anomaliesFlagged', {
                    count: nFlagged,
                    n: nFlagged,
                  })}
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </ValuationCard>
  );
}
