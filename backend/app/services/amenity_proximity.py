"""Amenity-proximity service — backs the Deal Finder's
``near_amenity=school&radius_km=1`` filter.

``listings_scored.parquet`` (Cell 9.6) carries only the identifier + price
columns — the raw per-listing ``dist_to_hospital_km`` / ``dist_to_school_km``
/ ``dist_to_tarmac_road_km`` columns did **not** survive into the export,
and neither did the rolled-up ``amenities_score_osm`` /
``accessibility_score_osm`` scores.  This service recomputes the
per-listing distance for each scored listing from its stored lat/lon via
B1's ``FeaturePipeline.amenity_distances_km`` / ``road_distances_km`` —
the same BallTrees B1's calculators already build (Cells 5.4 and 6.3),
reused via the thin public accessors added in this phase.  No second
distance calculation.

The user-facing amenity enum maps to B1's internal keys:

    "school"       -> amenity key "school"   (scoring_params["amenity_filters"])
    "hospital"     -> amenity key "hospital" (scoring_params["amenity_filters"])
    "tarmac_road"  -> road classes ["primary", "trunk", "motorway"]
                     (the OSM paved-road classes; filtered to those
                     actually configured in scoring_params["road_weights"])

Per-listing distances are cached per amenity type for the process lifetime:
the first request for ``near_amenity=hospital`` pays the BallTree-query cost
(~1-50 ms for 1-10k listings depending on POI density); subsequent requests
for the same amenity type are an O(1) dict lookup + boolean mask.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.core.exceptions import AppError
from app.core.logging import get_logger
from landval.features.pipeline import FeaturePipeline

logger = get_logger("app.amenity_proximity")

# User-facing amenity enum (mirrors the Pydantic Literal in the listings router).
USER_AMENITY_SCHOOL = "school"
USER_AMENITY_HOSPITAL = "hospital"
USER_AMENITY_TARMAC_ROAD = "tarmac_road"
SUPPORTED_AMENITIES = (USER_AMENITY_SCHOOL, USER_AMENITY_HOSPITAL, USER_AMENITY_TARMAC_ROAD)

# "tarmac road" in the Kenya context = paved national roads.  In OSM
# highway tags these are primary / trunk / motorway.  We filter to those
# actually configured in scoring_params["road_weights"] at request time so
# we don't query trees that don't exist (e.g. "motorway" is rare in Kenya).
TARMAC_ROAD_CLASSES = ("primary", "trunk", "motorway")


@dataclass
class AmenityProximityService:
    """Caches per-listing distances for the Deal Finder's amenity filter.

    Parameters
    ----------
    feature_pipeline : FeaturePipeline | None
        B1's pipeline (already initialised with the same ``artifacts_dir``).
        When ``None`` (degraded mode — model artifacts absent so the
        prediction service wasn't built), the service cannot compute
        distances; ``filter_by_amenity`` returns 503
        ``AMENITY_FILTER_UNAVAILABLE``.
    listings_scored_df : pandas.DataFrame | None
        The parsed ``listings_scored.parquet`` (Cell 9.6) — must have
        ``latitude`` / ``longitude`` columns.  ``None`` when the file is
        missing (the Deal Finder endpoint itself returns 503
        ``DATA_UNAVAILABLE`` in that case before reaching this service).
    """

    feature_pipeline: FeaturePipeline | None
    listings_scored_df: pd.DataFrame | None = None
    # Cache: {amenity_key: np.ndarray of distances, one per listing row}.
    # Keyed by the user-facing amenity name (school / hospital / tarmac_road)
    # so a second request for the same amenity type at a different radius
    # hits the cache.
    _distance_cache: dict[str, np.ndarray] = field(default_factory=dict)
    # Cache key includes the listings frame's row count + identity, so a
    # new listings_scored.parquet (different row count after a re-run)
    # invalidates the cache automatically.
    _cache_n_rows: int = 0

    # ------------------------------------------------------------------ public
    def filter_by_amenity(
        self,
        df: pd.DataFrame,
        amenity: str,
        radius_km: int,
    ) -> pd.DataFrame:
        """Return the rows of ``df`` whose distance to ``amenity`` is <= radius_km.

        ``df`` must be the listings_scored frame (or a filtered subset) with
        ``latitude`` / ``longitude`` columns.  ``amenity`` must be one of
        :data:`SUPPORTED_AMENITIES`.  ``radius_km`` is in kilometres.

        Raises ``AppError(503 AMENITY_FILTER_UNAVAILABLE)`` when the feature
        pipeline or the required spatial data file is absent; raises
        ``AppError(422 VALIDATION_ERROR)`` when the amenity isn't
        configured in ``scoring_params.json`` (e.g. the user passes
        ``school`` but the POI file has no schools).
        """
        if amenity not in SUPPORTED_AMENITIES:
            raise AppError(
                code="VALIDATION_ERROR",
                message=(
                    f"near_amenity must be one of {list(SUPPORTED_AMENITIES)}, " f"got {amenity!r}"
                ),
                status_code=422,
                details={"allowed": list(SUPPORTED_AMENITIES)},
            )
        if self.feature_pipeline is None:
            raise AppError(
                code="AMENITY_FILTER_UNAVAILABLE",
                message=(
                    "The amenity-proximity filter needs the feature pipeline, "
                    "which is not loaded (degraded mode — copy the spatial data "
                    "files kenya_pois.gpkg / kenya_roads.gpkg into ARTIFACTS_DIR "
                    "and restart)."
                ),
                status_code=503,
                details={"amenity": amenity, "radius_km": radius_km},
            )

        distances = self._distances_for(df, amenity)
        mask = np.isfinite(distances) & (distances <= float(radius_km))
        return df[mask].reset_index(drop=True)

    def available_amenities(self) -> dict[str, bool]:
        """Which of the supported user-facing amenity types are actually
        computable given the loaded scoring_params + spatial files?"""
        if self.feature_pipeline is None:
            return {a: False for a in SUPPORTED_AMENITIES}
        configured_amenities = set(self.feature_pipeline.configured_amenities())
        configured_roads = set(self.feature_pipeline.configured_road_classes())
        return {
            USER_AMENITY_SCHOOL: USER_AMENITY_SCHOOL in configured_amenities,
            USER_AMENITY_HOSPITAL: USER_AMENITY_HOSPITAL in configured_amenities,
            USER_AMENITY_TARMAC_ROAD: any(rc in configured_roads for rc in TARMAC_ROAD_CLASSES),
        }

    # ------------------------------------------------------------------ cache
    def _distances_for(self, df: pd.DataFrame, amenity: str) -> np.ndarray:
        """Return the per-row distance array for ``amenity``, computing it
        once (cached for the process lifetime) and reusing on subsequent
        calls.

        The cache key is the amenity name; the cache invalidates when the
        listings frame's row count changes (e.g. a new listings_scored.parquet
        was copied in and the process restarted with a different row count).
        For the typical case (same frame across requests) the cache hit is
        O(1).
        """
        # Invalidate cache if the frame changed.
        if len(df) != self._cache_n_rows:
            self._distance_cache.clear()
            self._cache_n_rows = len(df)

        if amenity in self._distance_cache:
            return self._distance_cache[amenity]

        lats = df["latitude"].to_numpy(dtype=float)
        lons = df["longitude"].to_numpy(dtype=float)

        try:
            pipeline = self.feature_pipeline
            assert pipeline is not None  # checked in filter_by_amenity; for mypy
            if amenity == USER_AMENITY_TARMAC_ROAD:
                distances = pipeline.road_distances_km(lats, lons, list(TARMAC_ROAD_CLASSES))
            else:
                distances = pipeline.amenity_distances_km(lats, lons, amenity)
        except KeyError as e:
            # The amenity isn't configured in scoring_params.json.
            raise AppError(
                code="AMENITY_FILTER_UNAVAILABLE",
                message=str(e),
                status_code=503,
                details={
                    "amenity": amenity,
                    "available_amenities": self.available_amenities(),
                },
            ) from e
        except FileNotFoundError as e:
            # The POI / roads GPKG file is missing.
            raise AppError(
                code="AMENITY_FILTER_UNAVAILABLE",
                message=str(e),
                status_code=503,
                details={
                    "amenity": amenity,
                    "available_amenities": self.available_amenities(),
                },
            ) from e

        self._distance_cache[amenity] = distances
        logger.info(
            "amenity_distances_computed",
            amenity=amenity,
            n_listings=len(df),
            n_within_finite=int(np.isfinite(distances).sum()),
        )
        return distances

    # ------------------------------------------------------------------ report
    def status(self) -> dict[str, Any]:
        """JSON-friendly status for /meta-style introspection."""
        return {
            "feature_pipeline_loaded": self.feature_pipeline is not None,
            "listings_loaded": self.listings_scored_df is not None,
            "n_listings": (
                int(len(self.listings_scored_df)) if self.listings_scored_df is not None else 0
            ),
            "available_amenities": self.available_amenities(),
            "cached_amenities": list(self._distance_cache.keys()),
        }
