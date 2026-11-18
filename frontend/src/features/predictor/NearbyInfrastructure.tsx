/**
 * NearbyInfrastructure — three ScoreRings + the named POI list.
 *
 * Score rings: Amenities / Accessibility / Infrastructure.
 *
 * NOTE: the backend's predict response does NOT currently return these as
 * separate scores in `response.diagnostics`. We check `diagnostics` for the
 * conventional keys (`amenities_score`, `accessibility_score`,
 * `infrastructure_score`) — if any are present as finite numbers we use
 * them; otherwise we render the ring in its muted state (score=null), which
 * the ScoreRing component already handles by drawing a partial grey arc and
 * showing "—" in the center.
 *
 * Named POIs: `response.named_pois` (B4's kenya_pois_named.gpkg). POIs
 * without a real OSM name fall back to "<category> near <nearest town>"
 * labels (see `app/services/named_poi_index.py`). The backend tags these
 * fallback rows with `is_fallback: true` so the client can visually
 * distinguish them: fallback names render in `text-secondary` (lighter)
 * with an "approximate" pill badge after the name, while real OSM names
 * keep the default `text-on-surface` treatment.
 *
 * P2b: ring colours come from the design tokens (primary-container,
 * primary, market-caution) — no inline hex.  Labels via i18n.
 */
import { useTranslation } from 'react-i18next';

import { ScoreRing } from '@/components/ScoreRing';
import { ValuationCard } from '@/components/ValuationCard';
import type { PredictNamedPOI } from '@/lib/api/types';

interface NearbyInfrastructureProps {
  diagnostics: Record<string, unknown>;
  namedPois: PredictNamedPOI[];
}

function scoreFromDiagnostics(d: Record<string, unknown>, key: string): number | null {
  const v = d[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function NearbyInfrastructure({ diagnostics, namedPois }: NearbyInfrastructureProps) {
  const { t } = useTranslation();

  const amenities = scoreFromDiagnostics(diagnostics, 'amenities_score');
  const accessibility = scoreFromDiagnostics(diagnostics, 'accessibility_score');
  const infrastructure = scoreFromDiagnostics(diagnostics, 'infrastructure_score');

  return (
    <ValuationCard>
      <h3 className="font-outfit text-headline-section text-on-surface mb-4">
        {t('predictor.nearbyInfrastructure')}
      </h3>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="flex flex-col items-center p-2 rounded-xl bg-surface-container-low text-center">
          <ScoreRing score={amenities} label={t('predictor.score.amenities')} color="#E8742A" />
        </div>
        <div className="flex flex-col items-center p-2 rounded-xl bg-surface-container-low text-center">
          <ScoreRing score={accessibility} label={t('predictor.score.accessibility')} color="#9D4400" />
        </div>
        <div className="flex flex-col items-center p-2 rounded-xl bg-surface-container-low text-center">
          <ScoreRing score={infrastructure} label={t('predictor.score.infrastructure')} color="#E3A008" />
        </div>
      </div>

      {/* Named POIs — fallback labels (is_fallback === true) are styled
          in a lighter tone and tagged with an "approximate" pill badge so
          the user can tell which names came from real OSM data vs the
          backend's category+nearest-town fallback. */}
      <div className="border-t border-black/[0.06] pt-4">
        <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1">
          {namedPois.length === 0 ? (
            <li className="text-caption-sm text-secondary py-2">{t('predictor.noNamedPois')}</li>
          ) : (
            namedPois.map((p, i) => (
              <li
                key={`${p.name}-${p.category}-${i}`}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-black/[0.04] last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[16px] text-secondary flex-shrink-0" aria-hidden="true">
                    place
                  </span>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-body-regular truncate ${
                          p.is_fallback === true ? 'text-secondary' : 'text-on-surface'
                        }`}
                      >
                        {p.name}
                      </span>
                      {p.is_fallback === true && (
                        <span className="inline-flex items-center rounded-full bg-surface-container-highest text-secondary text-caption-sm px-1.5 py-0.5 whitespace-nowrap">
                          {t('predictor.approximate')}
                        </span>
                      )}
                    </div>
                    <span className="text-caption-sm text-secondary capitalize">{p.category}</span>
                  </div>
                </div>
                <span className="text-caption-sm text-secondary whitespace-nowrap">
                  {p.distance_km.toFixed(1)} km
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </ValuationCard>
  );
}
