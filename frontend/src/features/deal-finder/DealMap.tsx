/**
 * DealMap — the spatial cluster view for the selected Deal Finder listing
 * (P4b real-data round).
 *
 * P4b change (problem G): the "nearby" markers now come from the REAL
 * nearest-listings endpoint (`useListingNearby(listingNo, radius, limit)`)
 * — haversine-nearest to the selected listing, excluding itself — instead
 * of the current table page (which was never "nearby" at all).
 *
 * Marker cap + radius come from the options/response (no typed
 * MAX_SECONDARY_MARKERS).  Verdict colours come from the single
 * VERDICT_STYLES token map (verdict-styles).  Loading / error / empty
 * states render honestly.  All strings via i18n.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Marker } from 'react-map-gl/maplibre';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import { MapLibreMap } from '@/components/MapLibreMap';
import { useListingNearby } from '@/lib/api/hooks';
import type { ListingsScoredRow } from '@/lib/api/types';
import { formatCompactMoney } from '@/lib/currency/format';

import { VERDICT_STYLES } from './verdict-styles';

interface Props {
  selected: ListingsScoredRow;
}

/** Map camera defaults — UI constants (zoom + pixel heights are allowed). */
const DEFAULT_ZOOM = 12;
const DEFAULT_MAP_HEIGHT = 'h-72';

function listingLabel(row: ListingsScoredRow, fallback: string): string {
  return row.title || row.location || row.county || row.listing_no || fallback;
}

function verdictHex(verdict: string): string {
  const v = VERDICT_STYLES[(verdict ?? '').toLowerCase()];
  return v?.hex ?? VERDICT_STYLES['fair'].hex;
}

export function DealMap({ selected }: Props) {
  const { t } = useTranslation();

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

  // P4b: REAL nearby listings from the endpoint (deterministic nearest,
  // self-excluded).  Disabled until coordinates exist.
  const nearbyQ = useListingNearby(
    selected.listing_no ?? null,
    50,
    50,
  );
  const nearby = nearbyQ.data?.nearby ?? [];

  if (!center) {
    return (
      <EmptyState
        icon="location_off"
        title={t('deals.mapNoCoordinates')}
        message={t('deals.mapNoCoordinatesHint')}
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg pb-3">
        <h3 className="font-headline-section text-headline-section text-on-surface">
          {t('deals.mapTitle')}
        </h3>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {listingLabel(selected, t('deals.untitled'))} ·{' '}
          {t('deals.mapSubtitle', {
            n: nearby.length,
            radius: nearbyQ.data?.radius_km ?? 50,
          })}
        </p>
        {/* Visually hidden text alternative for the map (a11y). */}
        <p className="sr-only">
          {t('deals.mapA11y', {
            listing: listingLabel(selected, t('deals.untitled')),
            price: formatCompactMoney(selected.listed_price_per_acre_ksh),
            n: nearby.length,
          })}
        </p>
      </div>
      <div className="px-space-lg pb-space-lg">
        {nearbyQ.isLoading ? (
          <LoadingSkeleton className="h-72 w-full rounded-md" />
        ) : nearbyQ.isError ? (
          <EmptyState
            icon="cloud_off"
            title={t('common.dataUnavailable')}
            message={t('deals.mapLoadFailed')}
            actionLabel={t('common.retry')}
            onAction={() => nearbyQ.refetch()}
          />
        ) : (
          <>
            <MapLibreMap
              initialLongitude={center.lng}
              initialLatitude={center.lat}
              initialZoom={DEFAULT_ZOOM}
              height={DEFAULT_MAP_HEIGHT}
            >
              {/* REAL nearby listings — verdict-coloured dots. */}
              {nearby.map((n, i) => (
                <Marker
                  key={`${n.listing_no ?? 'nearby'}-${i}`}
                  longitude={n.longitude as number}
                  latitude={n.latitude as number}
                  anchor="center"
                  aria-label={t('deals.nearbyA11y', {
                    n: formatCompactMoney(n.listed_price_per_acre_ksh),
                    km: n.distance_km,
                  })}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '9999px',
                      backgroundColor: verdictHex(n.verdict),
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
                  aria-label={t('deals.selectedPin')}
                  role="img"
                >
                  location_on
                </span>
              </Marker>
            </MapLibreMap>

            {/* Legend — visible text, not colour-only. */}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-caption-sm text-secondary">
              {(['underpriced', 'fair', 'overpriced'] as const).map((v) => (
                <span key={v} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '9999px',
                      backgroundColor: VERDICT_STYLES[v].hex,
                    }}
                  />
                  {t(VERDICT_STYLES[v].labelKey)}
                </span>
              ))}
            </div>

            {nearby.length === 0 && !nearbyQ.isLoading && (
              <p className="text-caption-sm text-secondary italic mt-2">
                {nearbyQ.data?.reason === 'no_coordinates'
                  ? t('deals.mapNoCoordinatesHint')
                  : t('deals.mapNoNearby')}
              </p>
            )}
          </>
        )}
      </div>
    </ValuationCard>
  );
}
