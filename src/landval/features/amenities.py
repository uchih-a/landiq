"""Amenities score (geographic-only) — mirrors Notebook 1 Cells 5.4–5.6.

Gravity model: ``score = sum(weight * exp(-beta * distance_km))`` per amenity,
clipped to [0, 1], x 100, rounded to 2 dp — identical to Cell 5.6's
``amenities_score_osm``.

The BallTree uses the haversine metric with radians, and distances are
multiplied by EARTH_RADIUS_KM (6371.0) — identical to Cell 5.4's
``calc_distances``.
"""

from __future__ import annotations

import numpy as np
from sklearn.neighbors import BallTree

from landval.features.geo import EARTH_RADIUS_KM


class AmenitiesCalculator:
    """Builds per-amenity BallTrees from the POI file and computes the score.

    Parameters
    ----------
    scoring_params : dict
        Parsed ``scoring_params.json`` — must contain ``amenity_params``
        (``{amenity: [weight, beta]}``) and ``amenity_filters``
        (``{amenity: {tag_col: [values]}}``).
    pois_path : str
        Path to ``kenya_pois.gpkg``.
    """

    def __init__(self, scoring_params: dict, pois_path: str):
        self.params = {
            name: (float(w), float(b)) for name, (w, b) in scoring_params["amenity_params"].items()
        }
        self.filters = scoring_params["amenity_filters"]
        self.pois_path = pois_path
        self._pois_gdf = None
        self._trees: dict[str, BallTree | None] = {}
        self._load_time_s = 0.0

    def _ensure_loaded(self) -> None:
        if self._pois_gdf is not None:
            return
        import time

        import geopandas as gpd

        t0 = time.perf_counter()
        pois = gpd.read_file(self.pois_path, columns=["geometry", "amenity", "shop", "highway"])
        tag_cols = [c for c in ["amenity", "shop", "highway"] if c in pois.columns]
        pois = (
            pois.dropna(subset=tag_cols, how="all")
            .loc[lambda d: d.geometry.notnull()]
            .reset_index(drop=True)
        )
        self._pois_gdf = pois

        # Build one BallTree per amenity — Cell 5.4 build_tree
        for amenity, tag_filters in self.filters.items():
            self._trees[amenity] = self._build_tree(pois, tag_filters)

        self._load_time_s = time.perf_counter() - t0

    def _build_tree(self, gdf, tag_filters: dict) -> BallTree | None:
        """Cell 5.4 ``build_tree`` — haversine BallTree from filtered POIs."""
        # Cell 5.4 filter_pois
        masks = [gdf[col].isin(values) for col, values in tag_filters.items() if col in gdf.columns]
        if not masks:
            return None
        combined = masks[0]
        for m in masks[1:]:
            combined = combined | m
        filtered = gdf[combined]

        # Cell 5.4 build_tree
        coords = np.radians(
            np.array([[g.y, g.x] for g in filtered.geometry if g is not None and not g.is_empty])
        )
        return BallTree(coords, metric="haversine") if len(coords) > 0 else None

    def _nearest_distance_km(self, lat: float, lon: float, tree: BallTree | None) -> float:
        """Cell 5.4 ``calc_distances`` for a single point.

        Returns NaN if tree is None or coordinates are missing.
        """
        if tree is None or lat is None or lon is None:
            return float("nan")
        coords = np.radians(np.array([[lat, lon]]))
        dist, _ = tree.query(coords, k=1)
        return float(dist.flatten()[0] * EARTH_RADIUS_KM)

    # ------------------------------------------------------------------ public
    # Thin public accessors over the existing private distance query — same
    # BallTree, same haversine metric, same EARTH_RADIUS_KM multiplier.  No
    # second distance calculation: these just expose what ``_nearest_distance_km``
    # already does so callers (e.g. the Deal Finder's amenity-proximity filter)
    # don't have to reach into ``_trees`` directly.
    def nearest_amenity_distance_km(self, lat: float, lon: float, amenity: str) -> float:
        """Distance to the nearest POI of ``amenity`` (km), or NaN if the
        amenity isn't configured or has no POIs in the file.

        ``amenity`` must be a key in ``scoring_params["amenity_filters"]``
        (e.g. ``"hospital"``, ``"school"``).  Raises ``KeyError`` if the
        amenity is not configured — callers should catch this and surface
        a 422 / 503 to the user.  Returns NaN for NaN / None coordinates
        (sklearn's BallTree.query would otherwise raise on NaN input).
        """
        self._ensure_loaded()
        if amenity not in self._trees:
            raise KeyError(
                f"amenity {amenity!r} is not configured in scoring_params['amenity_filters']; "
                f"available: {sorted(self._trees.keys())}"
            )
        # Guard NaN coords — the private _nearest_distance_km checks None but
        # not NaN, and sklearn's BallTree.query raises ValueError on NaN input.
        if lat is None or lon is None or not (np.isfinite(lat) and np.isfinite(lon)):
            return float("nan")
        return self._nearest_distance_km(lat, lon, self._trees[amenity])

    def nearest_amenity_distances_km(
        self, lats: np.ndarray, lons: np.ndarray, amenity: str
    ) -> np.ndarray:
        """Vectorised distance query — same BallTree, same math as
        ``_nearest_distance_km``, just batched over many points.

        Returns a float array of length ``len(lats)``; NaN where the
        amenity isn't configured, the tree is empty, or a coordinate is
        missing.  The Deal Finder uses this to compute the per-listing
        distance for every scored listing in one shot (one BallTree.query
        call instead of N single-point calls).
        """
        self._ensure_loaded()
        if amenity not in self._trees:
            raise KeyError(
                f"amenity {amenity!r} is not configured in scoring_params['amenity_filters']; "
                f"available: {sorted(self._trees.keys())}"
            )
        tree = self._trees[amenity]
        if tree is None:
            return np.full(len(lats), np.nan, dtype=float)
        # Mask out NaN coordinates (BallTree.query raises on NaN input).
        lats = np.asarray(lats, dtype=float)
        lons = np.asarray(lons, dtype=float)
        valid = np.isfinite(lats) & np.isfinite(lons)
        out = np.full(len(lats), np.nan, dtype=float)
        if valid.any():
            coords = np.radians(np.column_stack([lats[valid], lons[valid]]))
            dist, _ = tree.query(coords, k=1)
            out[valid] = dist.flatten() * EARTH_RADIUS_KM
        return out

    def compute_score(self, lat: float, lon: float) -> float:
        """Compute ``amenities_score_osm`` for a single point.

        Cell 5.6 formula:
        ``sum(weight * exp(-beta * dist_km))`` over amenities,
        clipped to [0, 1], x 100, rounded to 2 dp.
        """
        self._ensure_loaded()

        raw_score = 0.0
        for amenity, (weight, beta) in self.params.items():
            tree = self._trees.get(amenity)
            dist_km = self._nearest_distance_km(lat, lon, tree)
            if dist_km is not None and not np.isnan(dist_km):
                raw_score += weight * np.exp(-beta * dist_km)

        return round(np.clip(raw_score, 0, 1) * 100, 2)

    @property
    def load_time_s(self) -> float:
        self._ensure_loaded()
        return self._load_time_s

    @property
    def memory_mb(self) -> float:
        self._ensure_loaded()
        return self._pois_gdf.memory_usage(deep=True).sum() / 1e6

    @property
    def tree_counts(self) -> dict[str, int]:
        """Number of POIs indexed per amenity (for diagnostics)."""
        self._ensure_loaded()
        return {a: (t.data.shape[0] if t is not None else 0) for a, t in self._trees.items()}
