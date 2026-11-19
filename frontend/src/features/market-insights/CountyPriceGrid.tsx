/**
 * CountyPriceGrid — the Market Insights choropleth (P3b real-data round).
 *
 * Colours each county by the DATA-DRIVEN band INDEX resolved from the
 * response's `price_bands` edges (quintiles of the county medians —
 * recomputed whenever the prop_type filter changes so the legend always
 * matches the map).  The typed thresholds (1.5M / 3M / 6M / 12M) are
 * gone; the frontend only maps band index -> colour token.
 *
 * Legend labels are formatted from the response's band edges with the
 * currency-aware compact formatter (the KSh/USD toggle applies), and
 * carry visible text (not colour-only).  A boundaries failure renders
 * the map's error state WITHOUT breaking the rank list (the parent
 * keeps rendering the rest of the page).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layer, Source } from 'react-map-gl/maplibre';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import { MapLibreMap } from '@/components/MapLibreMap';
import type { ApiQueryResult } from '@/lib/api/hooks';
import type {
  CountySummaryResponse,
  GeoJSONFeatureCollection,
  PriceBandEdge,
} from '@/lib/api/types';
import { formatCompactMoney } from '@/lib/currency/format';

import { NO_DATA_BAND, bandForIndex, bandIndexForMedian, countyNameFromFeature } from './helpers';

interface Props {
  summaryQ: ApiQueryResult<CountySummaryResponse>;
  boundariesQ: ApiQueryResult<GeoJSONFeatureCollection>;
  selectedCounty: string | null;
  onSelectCounty: (county: string) => void;
}

/** Map camera defaults — UI constants (map zoom + pixel heights are
 * explicitly allowed by the no-hard-coded rule). */
const KENYA_CENTER = { lng: 37.9, lat: 0.5, zoom: 5.5 };
const COUNTY_FILL_LAYER_ID = 'county-fill';

export function CountyPriceGrid({
  summaryQ,
  boundariesQ,
  selectedCounty,
  onSelectCounty,
}: Props) {
  const { t } = useTranslation();

  // Lowercased-name -> resolved band index (computed from the response's
  // data-driven edges, never typed thresholds).
  const bandIndexByCounty = useMemo(() => {
    const m = new Map<string, number | null>();
    const bands: PriceBandEdge[] = summaryQ.data?.price_bands ?? [];
    for (const row of summaryQ.data?.counties ?? []) {
      m.set(row.county.toLowerCase(), bandIndexForMedian(row.median_price_per_acre_ksh, bands));
    }
    return m;
  }, [summaryQ.data]);

  const features = useMemo(
    () => boundariesQ.data?.features ?? [],
    [boundariesQ.data],
  );

  // Build the data-driven `fill-color` expression: each known county name
  // (verbatim from the GeoJSON) mapped to its band's hex colour; counties
  // absent from the summary fall through to the no-data grey.
  const fillColorExpr = useMemo<unknown[]>(() => {
    const expr: unknown[] = ['match', ['get', 'county']];
    for (const f of features) {
      const name = countyNameFromFeature(f.properties);
      if (!name) continue;
      const idx = bandIndexByCounty.get(name.toLowerCase()) ?? null;
      expr.push(name, bandForIndex(idx).hexColor);
    }
    expr.push(NO_DATA_BAND.hexColor);
    return expr;
  }, [features, bandIndexByCounty]);

  const summaryLoading = summaryQ.isLoading;
  const boundariesLoading = boundariesQ.isLoading;
  const isLoading = summaryLoading || boundariesLoading;
  // P3b: a boundaries failure renders the map's error state WITHOUT
  // breaking the rank list (the parent keeps rendering the rest).
  const boundariesFailed = boundariesQ.isError;
  const summaryFailed = summaryQ.isError;

  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-96 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }

  if (boundariesFailed || summaryFailed) {
    return (
      <EmptyState
        icon="cloud_off"
        title={t('common.dataUnavailable')}
        message={t('market.mapLoadFailed')}
        actionLabel={t('common.retry')}
        onAction={() => {
          if (summaryFailed) summaryQ.refetch();
          if (boundariesFailed) boundariesQ.refetch();
        }}
      />
    );
  }
  if (features.length === 0) {
    return (
      <EmptyState icon="map" title={t('market.noBoundaries')} message={t('market.noBoundariesMessage')} />
    );
  }

  const bands: PriceBandEdge[] = summaryQ.data?.price_bands ?? [];
  const bandsReason = summaryQ.data?.bands_reason ?? null;

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg pb-3">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('market.choropleth')}
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {t('market.choroplethHint')}
        </p>
        {/* Visually hidden text summary for screen readers (a11y). */}
        <p className="sr-only">
          {t('market.mapSummary', {
            n: summaryQ.data?.n_counties_with_data ?? 0,
            total: summaryQ.data?.n_counties_total ?? 0,
          })}
        </p>
      </div>

      <div className="px-space-lg pb-space-lg">
        <MapLibreMap
          initialLongitude={KENYA_CENTER.lng}
          initialLatitude={KENYA_CENTER.lat}
          initialZoom={KENYA_CENTER.zoom}
          height="h-96"
          interactiveLayerIds={[COUNTY_FILL_LAYER_ID]}
          onMapClick={(_lng, _lat, clickedFeatures) => {
            if (!clickedFeatures || clickedFeatures.length === 0) return;
            const county = countyNameFromFeature(clickedFeatures[0].properties);
            if (county) onSelectCounty(county);
          }}
        >
          <Source
            id="counties"
            type="geojson"
            data={boundariesQ.data as unknown as GeoJSON.GeoJSON}
          >
            <Layer
              id={COUNTY_FILL_LAYER_ID}
              type="fill"
              paint={{
                'fill-color': fillColorExpr as unknown as string,
                'fill-opacity': 0.75,
              }}
            />
            <Layer
              id="county-line"
              type="line"
              paint={{
                'line-color': '#574238',
                'line-width': 0.5,
                'line-opacity': 0.5,
              }}
            />
          </Source>
        </MapLibreMap>
        <p className="text-caption-sm text-secondary mt-2">
          {selectedCounty
            ? t('market.selectedCounty', { county: selectedCounty })
            : t('market.mapTip')}
        </p>

        {/* Legend — labels formatted from the response's band edges with
            the currency-aware formatter; visible text, not colour-only. */}
        <div className="mt-3 pt-3 border-t border-surface-container">
          <div className="text-caption-sm font-caption-sm text-secondary mb-1.5">
            {t('market.legendTitle')}
          </div>
          {bands.length === 0 ? (
            <p className="text-caption-sm text-secondary italic">
              {t('market.bandsUnavailable', {
                reason: bandsReason ? t(`market.bandsReason.${bandsReason}`) : '',
              })}
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {bands.map((b) => {
                const style = bandForIndex(b.index);
                const label =
                  b.upper == null
                    ? t('market.bandLabelOpen', { lower: formatCompactMoney(b.lower) })
                    : t('market.bandLabel', {
                        lower: formatCompactMoney(b.lower),
                        upper: formatCompactMoney(b.upper),
                      });
                return (
                  <span key={b.index} className="inline-flex items-center gap-1.5 text-caption-sm text-secondary">
                    <span className={`w-2.5 h-2.5 rounded-full ${style.dotClass}`} aria-hidden="true" />
                    {label}
                  </span>
                );
              })}
              <span className="inline-flex items-center gap-1.5 text-caption-sm text-secondary">
                <span className={`w-2.5 h-2.5 rounded-full ${NO_DATA_BAND.dotClass}`} aria-hidden="true" />
                {t('market.noDataBand')}
              </span>
            </div>
          )}
        </div>
      </div>
    </ValuationCard>
  );
}
