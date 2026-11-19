/**
 * ErrorBySupportBars — "Error by listings nearby" card (P5b real-data round).
 *
 * The endpoint data was ALREADY wired (the P5 fidelity pass) — this
 * round makes it data-driven end-to-end:
 *  - bands ordered by the response's `band_order` (never parsed from
 *    strings like "<10 (below COVERAGE_MIN_COUNTY_N)");
 *  - band labels verbatim from the response (any embedded threshold is
 *    the notebook's own export text);
 *  - approximate typical error % via exp(oof_mae)-1 (labelled
 *    approximate; the raw log value stays in the tooltip);
 *  - "n = N" per band; low-n bands marked "limited sample" using the
 *    min-n value from /meta (never typed);
 *  - loading / error + retry / empty states;
 *  - strings via i18n; numbers via the locale helper.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import { useMeta } from '@/lib/api/hooks';
import type { ApiQueryResult } from '@/lib/api/hooks';
import type { ErrorBySupportResponse, ErrorBySupportRow } from '@/lib/api/types';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  CHART_COLOR_OUTLINE as HATCH_STROKE,
  CHART_COLOR_PRIMARY_CONTAINER as BAR_COLOR,
} from '@/lib/ui/chart-tokens';
import { logErrorToPct } from './metrics-helpers';

interface Props {
  query: ApiQueryResult<ErrorBySupportResponse>;
}

interface Bucket {
  band: string;
  bandOrder: number;
  nListings: number;
  maePct: number; // approximate typical-miss % via exp(mae)-1
  logMae: number;
  isSparse: boolean;
}

export function ErrorBySupportBars({ query }: Props) {
  const { t } = useTranslation();
  const locale = useLocale();
  const metaQ = useMeta();
  // The min-n value from /meta (never typed) drives the "limited sample"
  // marking — the same threshold the rest of the app surfaces.
  const minCountyN = metaQ.data?.coverage?.min_county_n ?? null;

  const { data, isLoading, isError, refetch } = query;

  const buckets = useMemo<Bucket[]>(() => {
    if (!data?.rows) return [];
    // The design shows the nearby-listings measure; fall back to the
    // first present group when only one exists.
    const measures = data.support_measures?.map((m) => m.value) ?? [];
    const measure =
      measures.includes('nearby_within_50km')
        ? 'nearby_within_50km'
        : (measures[0] as string | undefined);
    const rows = data.rows.filter(
      (r) => measure == null || r.support_measure === measure,
    );
    // P5b: order by band_order (the backend's ordinal), never a
    // client-side string parse.
    return rows
      .slice()
      .sort((a, b) => a.band_order - b.band_order)
      .map((r: ErrorBySupportRow) => ({
        band: r.band,
        bandOrder: r.band_order,
        nListings: r.n_listings,
        maePct: logErrorToPct(r.oof_mae),
        logMae: r.oof_mae,
        // Sparse = n below the /meta min-n (null threshold -> not marked,
        // never a guessed number).
        isSparse: minCountyN != null ? r.n_listings < minCountyN : false,
      }));
  }, [data, minCountyN]);

  const maxMae = Math.max(1, ...buckets.map((b) => b.maePct));

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('model.errorBySupport')}
        </h2>
        <p className="font-body-regular text-secondary mt-0.5">
          {t('model.errorBySupportSubtitle')}
        </p>

        <div className="mt-space-md">
          {isLoading ? (
            <LoadingSkeleton className="h-48 w-full rounded-md" />
          ) : isError ? (
            <EmptyState
              icon="cloud_off"
              title={t('common.dataUnavailable')}
              message={t('model.errorBySupportLoadFailed')}
              actionLabel={t('common.retry')}
              onAction={() => refetch()}
            />
          ) : buckets.length === 0 ? (
            <EmptyState
              icon="bar_chart"
              title={t('model.noErrorDataTitle')}
              message={t('model.noErrorDataMessage')}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {buckets.map((b) => (
                <div key={`${b.band}-${b.bandOrder}`} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    {/* Band label verbatim from the response — any
                        embedded threshold is the notebook's own export
                        text, never re-derived client-side. */}
                    <span className="text-on-surface font-medium">{b.band}</span>
                    <span className="text-secondary tabular-nums">
                      {t('model.errorBySupportRow', {
                        n: b.nListings.toLocaleString(locale),
                        pct: b.maePct.toFixed(0),
                      })}
                    </span>
                  </div>
                  <div
                    className="relative h-4 w-full bg-surface-container-highest rounded-full overflow-hidden"
                    title={t('model.logMaeTitle', { v: b.logMae.toFixed(3) })}
                  >
                    {/* Sparse band: hatched fill. Normal: solid orange. */}
                    {b.isSparse ? (
                      <div
                        className="absolute left-0 top-0 bottom-0 rounded-full"
                        style={{
                          width: `${(b.maePct / maxMae) * 100}%`,
                          backgroundImage: `repeating-linear-gradient(45deg, ${HATCH_STROKE}, ${HATCH_STROKE} 1.25px, transparent 1.25px, transparent 8px)`,
                          opacity: 0.7,
                        }}
                      />
                    ) : (
                      <div
                        className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-300"
                        style={{ width: `${(b.maePct / maxMae) * 100}%`, backgroundColor: BAR_COLOR }}
                      />
                    )}
                  </div>
                  {b.isSparse && (
                    <span className="text-[10px] text-secondary italic">
                      {t('model.limitedSample')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-caption-sm text-secondary mt-3">
          {t('model.errorBySupportNote')}
        </p>
      </div>
    </ValuationCard>
  );
}
