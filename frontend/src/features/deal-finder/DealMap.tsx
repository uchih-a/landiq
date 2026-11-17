/**
 * DealMap — the spatial cluster view for the selected Deal Finder listing.
 *
 * Renders a MapLibre map centred on the selected listing's coordinates,
 * with:
 *   - a highlighted pin for the selected listing (Material Symbols
 *     `location_on`, primary-container colour, larger),
 *   - smaller dots for the other listings on the current page, coloured
 *     by verdict (underpriced / fair / overpriced).
 *
 * Capped at 50 secondary markers so a wide-open filter doesn't brick
 * the DOM. Renders nothing when no listing is selected or the selected
 * listing is missing latitude / longitude.
 */
import { useMemo } from 'react';
import { Marker } from 'react-map-gl/maplibre';

import { MapLibreMap } from '@/components/MapLibreMap';
import { ValuationCard } from '@/components/ValuationCard';
import type { ListingsScoredRow } from '@/lib/api/types';

interface Props {
  selected: ListingsScoredRow;
  rows: ListingsScoredRow[];
}

const VERDICT_COLORS: Record<string, string> = {
  underpriced: '#2F9E5F', // market-opportunity
  fair: '#6a5b56', // secondary
  overpriced: '#D6455D', // market-overvalued
};

const DEFAULT_VERDICT_COLOR = '#6a5b56';
const MAX_SECONDARY_MARKERS = 50;

function verdictColor(verdict: string): string {
  return VERDICT_COLORS[verdict] ?? DEFAULT_VERDICT_COLOR;
}

function listingLabel(row: ListingsScoredRow): string {
  return row.title || row.location || row.county || row.listing_no || 'Listing';
}

export function DealMap({ selected, rows }: Props) {
  const center = useMemo(() => {
    if (
      selected.latitude == null ||
      selected.longitude == null ||
      !Number.isFinite(selected.latitude) ||
      !Number.isFinite(selected.longitude)
    ) {
      return null;
    }
    return { lat: selected.latitude, lng: selected.longitude };
  }, [selected]);

  // Pick up to MAX_SECONDARY_MARKERS nearby rows (excluding the selected
  // one) that have valid coordinates. We don't sort by distance here —
  // the page's rows already arrive sorted by `listed_over_predicted`.
  const secondary = useMemo(() => {
    if (!center) return [];
    const out: ListingsScoredRow[] = [];
    for (const r of rows) {
      if (r.listing_no != null && r.listing_no === selected.listing_no) continue;
      if (
        r.latitude == null ||
        r.longitude == null ||
        !Number.isFinite(r.latitude) ||
        !Number.isFinite(r.longitude)
      ) {
        continue;
      }
      out.push(r);
      if (out.length >= MAX_SECONDARY_MARKERS) break;
    }
    return out;
  }, [rows, selected.listing_no, center]);

  if (!center) return null;

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg pb-3">
        <h3 className="font-headline-section text-headline-section text-on-surface">
          Corridor Spatial Cluster
        </h3>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {listingLabel(selected)} · {secondary.length + 1} listings shown
        </p>
      </div>
      <div className="px-space-lg pb-space-lg">
        <MapLibreMap
          initialLongitude={center.lng}
          initialLatitude={center.lat}
          initialZoom={12}
          height="h-72"
        >
          {/* Secondary listings — smaller dots coloured by verdict. */}
          {secondary.map((r, i) => (
            <Marker
              key={`${r.listing_no ?? 'listing'}-${i}`}
              longitude={r.longitude as number}
              latitude={r.latitude as number}
              anchor="center"
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '9999px',
                  backgroundColor: verdictColor(r.verdict),
                  boxShadow: '0 1px 2px rgba(27,21,18,0.25)',
                }}
              />
            </Marker>
          ))}

          {/* Selected listing — highlighted pin on top. */}
          <Marker
            longitude={center.lng}
            latitude={center.lat}
            anchor="bottom"
          >
            <span
              className="material-symbols-outlined text-[32px] text-primary-container drop-shadow-md"
              style={{ transform: 'translateY(-2px)' }}
              aria-label="Selected listing"
            >
              location_on
            </span>
          </Marker>
        </MapLibreMap>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-caption-sm text-secondary">
          <span className="flex items-center gap-1.5">
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '9999px',
                backgroundColor: VERDICT_COLORS.underpriced,
              }}
            />
            Underpriced
          </span>
          <span className="flex items-center gap-1.5">
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '9999px',
                backgroundColor: VERDICT_COLORS.fair,
              }}
            />
            Fair
          </span>
          <span className="flex items-center gap-1.5">
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '9999px',
                backgroundColor: VERDICT_COLORS.overpriced,
              }}
            />
            Overpriced
          </span>
        </div>
      </div>
    </ValuationCard>
  );
}
