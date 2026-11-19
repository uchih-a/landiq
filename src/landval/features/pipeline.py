"""Feature pipeline — the single entry point the backend calls.

``compute_features(lat, lon, size_acres, prop_type, parcel_features)``
returns every model feature named in ``feature_manifest.json``, the county,
and diagnostics (nearest places with names and distances for the Nearby card).

All configurable values come from the exported JSON files
(``scoring_params.json``, ``reference_data.json``, ``feature_manifest.json``).
No numbers are hard-coded. Spatial indexes (county polygons, POI BallTrees,
road BallTrees) load once at first use and are cached.
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from landval.features.infrastructure import InfrastructureCalculator
from landval.features.proximity import ProximityCalculator


@dataclass
class FeatureResult:
    """The complete feature set for one map point."""

    features: dict[str, float | str | None]
    county: str | None
    diagnostics: dict[str, Any] = field(default_factory=dict)


class FeaturePipeline:
    """Loads all config and spatial indexes once, then answers feature requests.

    Parameters
    ----------
    artifacts_dir : str
        Directory containing ``scoring_params.json``, ``reference_data.json``,
        ``feature_manifest.json``, and the spatial data files
        (``kenya_counties.gpkg``, ``kenya_pois.gpkg``, ``kenya_roads.gpkg``).
    """

    def __init__(self, artifacts_dir: str):
        self.artifacts_dir = artifacts_dir

        # Load JSON config files
        self.scoring_params = self._load_json("scoring_params.json")
        self.reference_data = self._load_json("reference_data.json")
        self.feature_manifest = self._load_json("feature_manifest.json")

        # Proximity + infrastructure calculators (lightweight, no spatial data)
        self._proximity = ProximityCalculator(self.reference_data, self.scoring_params)
        self._infra = InfrastructureCalculator(self.scoring_params)

        # Spatial indexes — loaded lazily
        self._counties = None
        self._amenities = None
        self._accessibility = None

        # Extract model feature names from the manifest
        self.model_features = [
            f["name"]
            for f in self.feature_manifest.get("features", [])
            if f.get("is_model_feature", True)
        ]

        # Paths to spatial data files
        self._counties_path = os.path.join(artifacts_dir, "kenya_counties.gpkg")
        self._pois_path = os.path.join(artifacts_dir, "kenya_pois.gpkg")
        self._roads_path = os.path.join(artifacts_dir, "kenya_roads.gpkg")

    def _load_json(self, filename: str) -> dict:
        path = os.path.join(self.artifacts_dir, filename)
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Required config file not found: {path}. "
                f"Copy the backend exports from Notebook 1 Phase 10."
            )
        with open(path) as f:
            return json.load(f)

    def _ensure_counties(self):
        if self._counties is None and os.path.exists(self._counties_path):
            from landval.features.counties import CountyLookup

            self._counties = CountyLookup(self._counties_path)

    def _ensure_amenities(self):
        if self._amenities is None and os.path.exists(self._pois_path):
            from landval.features.amenities import AmenitiesCalculator

            self._amenities = AmenitiesCalculator(self.scoring_params, self._pois_path)

    def _ensure_accessibility(self):
        if self._accessibility is None and os.path.exists(self._roads_path):
            from landval.features.accessibility import AccessibilityCalculator

            self._accessibility = AccessibilityCalculator(self.scoring_params, self._roads_path)

    # ------------------------------------------------------------------ public
    # Distance accessors for callers that need the raw per-amenity /
    # per-road-class distance (not the rolled-up score).  The Deal Finder's
    # amenity-proximity filter (``near_amenity=school&radius_km=1``) uses
    # these to recompute per-listing distances from stored lat/lon — the
    # raw ``dist_to_*_km`` columns did not survive into
    # ``listings_scored.parquet`` (Cell 9.6 only carries identifier +
    # price columns), so the backend recomputes them via B1's existing
    # BallTrees (no second distance calculation).
    def amenity_distances_km(self, lats: np.ndarray, lons: np.ndarray, amenity: str) -> np.ndarray:
        """Vectorised distance to the nearest POI of ``amenity`` (km).

        Forces the lazy amenities calculator to load (the POI GPKG +
        per-amenity BallTrees) on first call; subsequent calls reuse the
        cached trees.  Raises ``FileNotFoundError`` if the POI file is
        absent; raises ``KeyError`` if ``amenity`` is not configured in
        ``scoring_params["amenity_filters"]``.
        """
        self._ensure_amenities()
        if self._amenities is None:
            raise FileNotFoundError(
                f"POI file not found at {self._pois_path}; cannot compute "
                f"amenity distances. Copy kenya_pois.gpkg into ARTIFACTS_DIR."
            )
        return self._amenities.nearest_amenity_distances_km(lats, lons, amenity)

    def road_distances_km(
        self, lats: np.ndarray, lons: np.ndarray, road_classes: list[str]
    ) -> np.ndarray:
        """Vectorised distance to the nearest road in any of ``road_classes`` (km).

        Forces the lazy accessibility calculator to load (the roads GPKG +
        per-class BallTrees) on first call.  Raises ``FileNotFoundError`` if
        the roads file is absent.  Unknown road classes are silently skipped
        (the calculator returns the min over whichever classes have trees).
        """
        self._ensure_accessibility()
        if self._accessibility is None:
            raise FileNotFoundError(
                f"Roads file not found at {self._roads_path}; cannot compute "
                f"road distances. Copy kenya_roads.gpkg into ARTIFACTS_DIR."
            )
        return self._accessibility.nearest_road_distances_km(lats, lons, road_classes)

    def configured_amenities(self) -> list[str]:
        """The amenity names configured in ``scoring_params["amenity_filters"]``."""
        return sorted(self.scoring_params.get("amenity_filters", {}).keys())

    def configured_road_classes(self) -> list[str]:
        """The road classes configured in ``scoring_params["road_weights"]``."""
        return sorted(self.scoring_params.get("road_weights", {}).keys())

    def compute_features(
        self,
        lat: float,
        lon: float,
        size_acres: float,
        prop_type: str = "Land",
        parcel_features: dict[str, int | None] | None = None,
    ) -> FeatureResult:
        """Compute every model feature for a single map point.

        Parameters
        ----------
        lat, lon : float
            The map point (WGS84).
        size_acres : float
            Parcel size in acres.
        prop_type : str
            Property type (default ``"Land"``).
        parcel_features : dict, optional
            Infrastructure checklist — keys are the ten item names
            (``borehole``, ``piped_water``, …), values are 0, 1, or None.

        Returns
        -------
        FeatureResult
            ``features`` dict with every model feature, ``county``, and
            ``diagnostics`` with nearby-place info for the Nearby card.
        """
        parcel_features = parcel_features or {}

        # ---- County from map point ----
        county = None
        try:
            self._ensure_counties()
            if self._counties is not None:
                county = self._counties.assign_county(lat, lon)
        except ValueError:
            # Point outside Kenya — propagate as None county
            county = None

        # ---- Proximity features (Cells 4.4 + 4.13) ----
        dist_nairobi = self._proximity.dist_to_nairobi_km(lat, lon)

        ref_city, ref_dist, dist_county_town = self._proximity.reference_city_and_dist(
            lat, lon, county
        )

        dist_water = self._proximity.dist_to_water_body_km(lat, lon, county)

        # ---- Size feature ----
        log_size_acres = (
            round(math.log(size_acres), 6) if size_acres and size_acres > 0 else float("nan")
        )

        # ---- Amenities score (Cell 5.6, geographic only) ----
        amenities_score = float("nan")
        if self._amenities is not None or os.path.exists(self._pois_path):
            self._ensure_amenities()
            if self._amenities is not None:
                amenities_score = self._amenities.compute_score(lat, lon)

        # ---- Accessibility score (Cell 6.8, geographic only) ----
        accessibility_score = float("nan")
        if os.path.exists(self._roads_path):
            self._ensure_accessibility()
            if self._accessibility is not None:
                accessibility_score = self._accessibility.compute_score(
                    lat, lon, ref_dist, dist_nairobi
                )

        # ---- Infrastructure score (Cell 7.4, from checklist) ----
        infra_score, infra_source = self._infra.compute_score(parcel_features, county)

        # ---- Assemble features dict ----
        features: dict[str, float | str | None] = {
            "latitude": lat,
            "longitude": lon,
            "log_size_acres": log_size_acres,
            "dist_to_nairobi_km": dist_nairobi,
            "dist_to_county_town_km": dist_county_town,
            "dist_to_water_body_km": dist_water,
            "reference_city_dist_km": ref_dist,
            "geocode_confidence": None,  # not available at prediction time
            "amenities_score_osm": amenities_score,
            "accessibility_score_osm": accessibility_score,
            "infrastructure_score": infra_score,
            # Categorical features
            "prop_type": prop_type,
            "county": county,
            "reference_city": ref_city if isinstance(ref_city, str) else None,
        }

        # ---- Diagnostics for the Nearby card ----
        diagnostics: dict[str, Any] = {
            "county": county,
            "reference_city": ref_city if isinstance(ref_city, str) else None,
            "dist_to_nairobi_km": dist_nairobi,
            "dist_to_county_town_km": dist_county_town,
            "dist_to_water_body_km": dist_water,
            "infra_source": infra_source,
            "spatial_indexes_loaded": {
                "counties": self._counties is not None,
                "amenities": self._amenities is not None,
                "accessibility": self._accessibility is not None,
            },
        }

        return FeatureResult(
            features=features,
            county=county,
            diagnostics=diagnostics,
        )

    def index_load_report(self) -> dict[str, dict]:
        """Report load time and memory for each spatial index."""
        report: dict[str, dict] = {}

        self._ensure_counties()
        if self._counties is not None:
            report["counties"] = {
                "load_time_s": round(self._counties.load_time_s, 3),
                "memory_mb": round(self._counties.memory_mb, 1),
            }

        self._ensure_amenities()
        if self._amenities is not None:
            report["amenities"] = {
                "load_time_s": round(self._amenities.load_time_s, 3),
                "memory_mb": round(self._amenities.memory_mb, 1),
                "tree_counts": self._amenities.tree_counts,
            }

        self._ensure_accessibility()
        if self._accessibility is not None:
            report["accessibility"] = {
                "load_time_s": round(self._accessibility.load_time_s, 3),
                "tree_counts": self._accessibility.tree_counts,
            }

        return report
