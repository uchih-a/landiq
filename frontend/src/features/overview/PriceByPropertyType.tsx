/**
 * PriceByPropertyType — three vertical bars (Land / Farm / Commercial)
 * from `overview.by_property_type`.
 *
 * O2 build round: brand-new card.  Matches the web design's 4-bar
 * card but with the canonical THREE property types (the design's
 * Agricultural / Residential / Commercial / Industrial labels are mock
 * content, replaced per the person's decision).
 *
 * Visual rules:
 *  - Hatched bars for non-leader types; solid orange for the leader.
 *  - Floating "KSh X.XM" pill on the leader bar (real value).
 *  - A type with n=0 shows an empty/muted bar with "no data" — never a
 *    zero-height bar that reads as a price.
 *  - Footer line: "<Leader> leads premium by +X%" from
 *    `leader_premium_pct`.  Hidden when null.
 *  - "View index" links to Market Insights.
 */
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { OverviewSummaryResponse } from '@/lib/api/types';
import { formatCompactMoney } from '@/lib/currency/format';

import { buildMarketInsightsUrl } from './overview-helpers';

interface PriceByPropertyTypeProps {
  overview: OverviewSummaryResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const LEADER_COLOR = '#e8742a';
const HATCH_STROKE = '#dec1b3';

export function PriceByPropertyType({
  overview,
  isLoading,
  isError,
  onRetry,
}: PriceByPropertyTypeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const bpt = overview?.by_property_type;
  const types = bpt?.types ?? [];
  const leader = bpt?.leader ?? null;
  const premiumPct = bpt?.leader_premium_pct ?? null;

  // Bar heights are proportional to the median across the three types.
  // Types with n=0 / null median get a small visible "no data" stub.
  const maxMedian = Math.max(
    1,
    ...types.map((tp) => tp.median_price_per_acre_ksh ?? 0),
  );

  return (
    <ValuationCard className="xl:col-span-1 md:col-span-1" noPadding>
      <div className="p-space-lg h-full flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-title-card text-title-card text-on-surface">
              {t('overview.priceByPropertyType')}
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              {t('overview.askingPricesPerAcre')}
            </p>
          </div>
          <button
            type="button"
            title="Filter"
            aria-label="Filter"
            className="w-9 h-9 rounded-full bg-surface-container-low text-on-surface-variant hover:text-primary flex items-center justify-center shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              tune
            </span>
          </button>
        </div>

        {isLoading ? (
          <LoadingSkeleton className="h-44 w-full rounded-md" />
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title={t('common.error')}
            message={t('common.dataUnavailable')}
            actionLabel={t('common.retry')}
            onAction={onRetry}
          />
        ) : types.length === 0 ? (
          <EmptyState icon="bar_chart" title={t('overview.emptySelection')} message="" />
        ) : (
          <div className="py-2 flex-1">
            {/* SVG bar chart — 3 bars, hatched non-leaders + solid leader */}
            <svg
              className="w-full h-44 overflow-visible"
              viewBox="0 0 320 160"
              role="img"
              aria-label={t('overview.priceByPropertyType')}
            >
              <defs>
                <pattern
                  id="propTypeHatch"
                  patternUnits="userSpaceOnUse"
                  width="6"
                  height="6"
                  patternTransform="rotate(45)"
                >
                  <line stroke={HATCH_STROKE} strokeWidth="1.2" x1="0" x2="0" y1="0" y2="6" />
                </pattern>
              </defs>
              {/* Baseline */}
              <line stroke="#eae1d9" strokeWidth="1" x1="20" x2="300" y1="140" y2="140" />
              {types.map((tp, i) => {
                const x = 36 + i * 80;
                const isLeader = leader === tp.name;
                const hasData = tp.n > 0 && tp.median_price_per_acre_ksh != null;
                const height = hasData
                  ? Math.max(8, (tp.median_price_per_acre_ksh! / maxMedian) * 116)
                  : 6;
                const y = 140 - height;
                const fill = isLeader ? LEADER_COLOR : 'url(#propTypeHatch)';
                return (
                  <g key={tp.name}>
                    <rect
                      fill={fill}
                      height={height}
                      rx={isLeader ? 8 : 6}
                      ry={isLeader ? 8 : 6}
                      stroke="#eae1d9"
                      strokeWidth="1"
                      width={isLeader ? 42 : 36}
                      x={x}
                      y={y}
                      className={isLeader ? 'shadow-sm' : ''}
                    />
                    {/* X-axis label */}
                    <text
                      className="fill-secondary font-caption-sm"
                      font-size="10"
                      text-anchor="middle"
                      x={x + (isLeader ? 21 : 18)}
                      y="154"
                    >
                      {tp.name}
                    </text>
                    {/* Value label or "no data" */}
                    {hasData && tp.median_price_per_acre_ksh != null ? (
                      <text
                        className="fill-secondary font-caption-sm font-medium"
                        font-size="10"
                        text-anchor="middle"
                        x={x + (isLeader ? 21 : 18)}
                        y={y - 6}
                      >
                        {formatCompactMoney(tp.median_price_per_acre_ksh).replace('KSh ', '')}
                      </text>
                    ) : (
                      <text
                        className="fill-secondary font-caption-sm italic"
                        font-size="10"
                        text-anchor="middle"
                        x={x + 18}
                        y={y - 6}
                      >
                        {t('overview.noDataForType')}
                      </text>
                    )}
                    {/* Floating pill on the leader */}
                    {isLeader && hasData && tp.median_price_per_acre_ksh != null && (
                      <g transform={`translate(${x - 6}, 4)`}>
                        <rect
                          fill="#1f1b16"
                          height="18"
                          rx="9"
                          width="62"
                          x="0"
                          y="0"
                        />
                        <text
                          fill="#ffffff"
                          font-family="Outfit"
                          font-size="9.5"
                          font-weight="600"
                          text-anchor="middle"
                          x="31"
                          y="13"
                        >
                          {formatCompactMoney(tp.median_price_per_acre_ksh)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Footer */}
        {!isLoading && !isError && (
          <div className="mt-4 pt-3 border-t border-surface-container flex items-center justify-between text-caption-sm font-caption-sm text-secondary">
            {leader != null && premiumPct != null ? (
              <span>{t('overview.leaderPremium', { leader, pct: premiumPct.toFixed(0) })}</span>
            ) : (
              <span>&nbsp;</span>
            )}
            <button
              type="button"
              onClick={() => navigate(buildMarketInsightsUrl())}
              className="font-medium text-primary hover:underline"
            >
              {t('overview.viewIndex')} →
            </button>
          </div>
        )}
      </div>
    </ValuationCard>
  );
}
