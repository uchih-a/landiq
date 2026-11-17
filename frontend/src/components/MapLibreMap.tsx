/**
 * MapLibreMap — shared MapLibre map wrapper around react-map-gl's `Map`.
 *
 * Uses the OSM raster tile source (no API key, no Mapbox token required).
 * react-map-gl v8 re-exports `@vis.gl/react-maplibre` through its
 * `react-map-gl/maplibre` subpath, so we import { Map, Marker, Source,
 * Layer } from there. The bare `'react-map-gl'` specifier has no root
 * export in v8's package.json `exports` map.
 *
 * The map is interactive by default (drag / zoom / click). Pass
 * `interactive={false}` for a static preview. `children` lets callers
 * drop in `<Marker>`, `<Source>` + `<Layer>` blocks, or any other
 * react-map-gl child.
 *
 * `onMapClick` receives `(lng, lat, features?)`. `features` is populated
 * only when `interactiveLayerIds` is set and the click hit one of those
 * layers — each entry's `properties` is the raw feature properties dict
 * (typed as `Record<string, unknown>`).
 */
import type { ReactNode } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import { Map } from 'react-map-gl/maplibre';

export interface ClickedFeature {
  properties: Record<string, unknown>;
}

interface MapLibreMapProps {
  initialLongitude: number;
  initialLatitude: number;
  initialZoom?: number;
  height?: string;
  onMapClick?: (
    lng: number,
    lat: number,
    features?: ClickedFeature[],
  ) => void;
  children?: ReactNode;
  interactive?: boolean;
  /** Layer ids whose features should be included in `onMapClick`'s
   * `features` array. Maps to react-map-gl's `interactiveLayerIds`. */
  interactiveLayerIds?: string[];
}

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [OSM_TILES],
      tileSize: 256,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
    },
  ],
};

export function MapLibreMap({
  initialLongitude,
  initialLatitude,
  initialZoom = 12,
  height = 'h-64',
  onMapClick,
  children,
  interactive = true,
  interactiveLayerIds,
}: MapLibreMapProps) {
  return (
    <div className={`${height} rounded-DEFAULT overflow-hidden`}>
      <Map
        initialViewState={{
          longitude: initialLongitude,
          latitude: initialLatitude,
          zoom: initialZoom,
        }}
        mapStyle={mapStyle}
        interactive={interactive}
        dragPan={interactive}
        scrollZoom={interactive}
        touchZoomRotate={interactive}
        doubleClickZoom={interactive}
        interactiveLayerIds={interactiveLayerIds}
        onClick={(e) => {
          if (onMapClick) {
            const feats: ClickedFeature[] | undefined =
              e.features && e.features.length > 0
                ? e.features.map((f) => ({
                    properties:
                      (f.properties as Record<string, unknown>) ?? {},
                  }))
                : undefined;
            onMapClick(e.lngLat.lng, e.lngLat.lat, feats);
          }
        }}
        attributionControl={{ compact: true }}
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </Map>
    </div>
  );
}
