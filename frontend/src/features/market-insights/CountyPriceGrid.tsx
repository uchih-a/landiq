/**
 * CountyPriceGrid — the Market Insights choropleth.
 *
 * Renders a MapLibre map of the Kenya county boundaries (B5
 * /counties/boundaries GeoJSON), colouring each county by its median
 * KSh-per-acre band (using `bandForMedian` from helpers.ts). Clicking a
 * county selects it so the deep-dive panel and the scatter plot react.
 *
 * The fill colour is computed via a MapLibre `match` data-driven
 * expression on the feature's `county` property — we build a
 * `[countyName → hex]` lookup by walking the GeoJSON features and
 * looking each name up in the summary's lowercased-keyed median map.
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
} from '@/lib/api/types';

import { bandForMedianOrange, countyNameFromFeature } from './helpers';

interface Props {
  summaryQ: ApiQueryResult<CountySummaryResponse>;
  boundariesQ: ApiQueryResult<GeoJSONFeatureCollection>;
  selectedCounty: string | null;
  onSelectCounty: (county: string) => void;
}

const KENYA_CENTER = { lng: 37.9, lat: 0.5, zoom: 5.5 };
const NO_DATA_COLOR = '#eae1d9';
const COUNTY_FILL_LAYER_ID = 'county-fill';

export function CountyPriceGrid({
  summaryQ,
  boundariesQ,
  selectedCounty,
  onSelectCounty,
}: Props) {
  const { t } = useTranslation();
  const isLoading = summaryQ.isLoading || boundariesQ.isLoading;
  const isError = summaryQ.isError || boundariesQ.isError;

  // Lowercased-name -> median lookup so we can match GeoJSON feature
  // names against summary rows without worrying about case.
  const medianByCounty = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of summaryQ.data?.counties ?? []) {
      m.set(row.county.toLowerCase(), row.median_price_per_acre_ksh);
    }
    return m;
  }, [summaryQ.data]);

  const features = useMemo(
    () => boundariesQ.data?.features ?? [],
    [boundariesQ.data],
  );

  // Build the data-driven `fill-color` expression. Each known county
  // name (verbatim from the GeoJSON) is mapped to its band's hex colour;
  // counties absent from the summary fall through to the no-data grey.
  // The expression tree is recursive (a `match` arm can itself be an
  // expression like `['get', 'county']`), so we type it as `unknown[]`
  // and cast at the Layer paint property.
  const fillColorExpr = useMemo<unknown[]>(() => {
    const expr: unknown[] = ['match', ['get', 'county']];
    for (const f of features) {
      const name = countyNameFromFeature(f.properties);
      if (!name) continue;
      const median = medianByCounty.get(name.toLowerCase()) ?? null;
      const band = bandForMedianOrange(median);
      expr.push(name, band.hexColor);
    }
    expr.push(NO_DATA_COLOR);
    return expr;
  }, [features, medianByCounty]);

  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-96 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title={t('common.dataUnavailable')}
        message="The county boundaries or summary feed is unavailable right now."
        actionLabel={t('common.retry')}
        onAction={() => {
          summaryQ.refetch();
          boundariesQ.refetch();
        }}
      />
    );
  }
  if (features.length === 0) {
    return (
      <EmptyState
        icon="map"
        title="No boundary data"
        message="The county boundaries GeoJSON is empty."
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg pb-3">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('market.choropleth')}
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          Each county is coloured by median KSh per acre. Click a county to deep-dive.
        </p>
      </div>

      <div className="px-space-lg pb-space-lg">
        <MapLibreMap
          initialLongitude={KENYA_CENTER.lng}
          initialLatitude={KENYA_CENTER.lat}
          initialZoom={KENYA_CENTER.zoom}
          height="h-96"
          interactiveLayerIds={[COUNTY_FILL_LAYER_ID]}
          onMapClick={(_lng, _lat, features) => {
            if (!features || features.length === 0) return;
            const county = countyNameFromFeature(features[0].properties);
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
            ? `Selected: ${selectedCounty}`
            : 'Tip: click a county tile to select it.'}
        </p>
      </div>
    </ValuationCard>
  );
}
