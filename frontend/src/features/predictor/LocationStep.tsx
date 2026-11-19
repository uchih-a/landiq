/**
 * LocationStep — Predictor Step 1: "Where is the land?"
 *
 * - PillInput for the typeahead query (debounced via `useDeferredValue` in
 *   the parent, then passed as `deferredQuery`).
 * - `usePlaceSearch(deferredQuery)` runs the gazetteer lookup (B4) and
 *   returns results in a dropdown; selecting one sets the lat/lon and
 *   advances to Step 2.
 * - When a place is selected, a real MapLibre map (via the shared
 *   `MapLibreMap` wrapper) is rendered with a draggable pin. Dragging
 *   the pin lets the user fine-tune the parcel's coordinates without
 *   re-searching. The parent lifts the pin's lat/lon via `onPinDrag`.
 * - Before any place is picked, we render only the search prompt (no
 *   map) — the map appears the moment `place` becomes non-null.
 */
import { useTranslation } from 'react-i18next';
import { Marker } from 'react-map-gl/maplibre';

import { MapLibreMap } from '@/components/MapLibreMap';
import { PillInput } from '@/components/PillInput';
import { usePlaceSearch } from '@/lib/api/hooks';
import type { PlaceSearchResult } from '@/lib/api/types';

interface LocationStepProps {
  query: string;
  deferredQuery: string;
  onQueryChange: (q: string) => void;
  place: PlaceSearchResult | null;
  onPick: (r: PlaceSearchResult) => void;
  onPinDrag: (lat: number, lon: number) => void;
}

export function LocationStep({
  query,
  deferredQuery,
  onQueryChange,
  place,
  onPick,
  onPinDrag,
}: LocationStepProps) {
  const { t } = useTranslation();
  const searchQ = usePlaceSearch(deferredQuery);
  const results = searchQ.data?.results ?? [];
  const showDropdown = results.length > 0 && query.length > 0;

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex flex-col gap-2">
        <label className="text-label-metric font-label-metric text-secondary">
          {t('predictor.step1')}
        </label>
        <PillInput
          leadingIcon="search"
          placeholder={t('predictor.searchLocation')}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label={t('predictor.searchLocation')}
        />
        {showDropdown && (
          <ul
            role="listbox"
            className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 max-h-72 overflow-y-auto py-1 z-10"
          >
            {results.map((r, i) => (
              <li key={`${r.name}-${r.latitude}-${r.longitude}-${i}`} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => onPick(r)}
                  className="block w-full text-left px-4 py-2.5 hover:bg-surface-container-low transition-colors"
                >
                  <div className="text-body-medium font-body-medium text-on-surface">{r.name}</div>
                  <div className="text-caption-sm text-secondary">{r.subtitle}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {place ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-caption-sm text-secondary">
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">drag_indicator</span>
            {t('predictor.dragHint')}
          </div>
          <MapLibreMap
            initialLongitude={place.longitude}
            initialLatitude={place.latitude}
            initialZoom={13}
            height="h-64"
          >
            <Marker
              longitude={place.longitude}
              latitude={place.latitude}
              draggable
              onDragEnd={(e) => {
                onPinDrag(e.lngLat.lat, e.lngLat.lng);
              }}
              anchor="bottom"
            >
              <span
                className="material-symbols-outlined text-[36px] text-primary-container drop-shadow-md"
                style={{ transform: 'translateY(-2px)' }}
                aria-label="Draggable location pin"
              >
                location_on
              </span>
            </Marker>
          </MapLibreMap>
          <div className="flex items-center justify-between text-caption-sm text-secondary">
            <span className="truncate">
              {place.name}
              {place.county ? ` · ${place.county}` : ''}
            </span>
            <span className="tabular-nums whitespace-nowrap">
              {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-space-xl text-center rounded-DEFAULT bg-surface-container-high border border-black/[0.06]">
          <span className="material-symbols-outlined text-[40px] text-secondary">map</span>
          <div className="text-caption-sm text-secondary">{t('predictor.searchLocation')}</div>
        </div>
      )}
    </div>
  );
}
