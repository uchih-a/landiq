"""Accessibility score (geographic-only) — mirrors Notebook 1 Cells 6.3–6.8.

Road score: ``max over road classes of weight * exp(-ROAD_BETA * dist_km)``,
clipped to [0, 1]  (Cell 6.5, pre-floor copy).

Town score: ``exp(-TOWN_BETA * reference_city_dist_km)``, NaN→0  (Cell 6.7).

Nairobi score: ``exp(-NAIROBI_BETA * dist_to_nairobi_km)``, NaN→0  (Cell 6.7).

Final: ``SCORE_WEIGHTS.road * road + SCORE_WEIGHTS.town * town +
SCORE_WEIGHTS.nairobi * nairobi``, clipped [0,1], x100, round 2dp  (Cell 6.8).

The road BallTree uses the haversine metric with radians, and distances
are multiplied by EARTH_RADIUS_KM (6371.0) — identical to Cell 6.4.
"""

from __future__ import annotations

import numpy as np
from sklearn.neighbors import BallTree

from landval.features.geo import EARTH_RADIUS_KM


class AccessibilityCalculator:
    """Builds per-road-class BallTrees from the roads file and computes the score.

    Parameters
    ----------
    scoring_params : dict
        Parsed ``scoring_params.json`` — must contain ``road_weights``,
        ``road_beta``, ``town_beta``, ``nairobi_beta``, ``score_weights``.
    roads_path : str
        Path to ``kenya_roads.gpkg``.
    """

    def __init__(self, scoring_params: dict, roads_path: str):
        self.road_weights = {k: float(v) for k, v in scoring_params["road_weights"].items()}
        self.road_beta = float(scoring_params["road_beta"])
        self.town_beta = float(scoring_params["town_beta"])
        self.nairobi_beta = float(scoring_params["nairobi_beta"])
        self.score_weights = {k: float(v) for k, v in scoring_params["score_weights"].items()}
        self.roads_path = roads_path
        self._trees: dict[str, BallTree | None] = {}
        self._load_time_s = 0.0

    def _ensure_loaded(self) -> None:
        if self._trees:
            return
        import time

        import geopandas as gpd

        t0 = time.perf_counter()
        roads = gpd.read_file(self.roads_path)

        # Cell 6.2 — filter to known road classes
        if "highway" in roads.columns:
            roads = roads[roads["highway"].isin(self.road_weights.keys())].copy()

        # Cell 6.3 — build one BallTree per road type
        for road_type in self.road_weights:
            subset = (
                roads[roads["highway"] == road_type]
                if "highway" in roads.columns
                else gpd.GeoDataFrame()
            )
            self._trees[road_type] = self._build_road_tree(subset)

        self._load_time_s = time.perf_counter() - t0

    def _build_road_tree(self, gdf) -> BallTree | None:
        """Cell 6.3 ``build_road_tree`` — haversine BallTree from road vertices.

        shapely returns (lon, lat) — flip to (lat, lon) for haversine.
        """
        if len(gdf) == 0:
            return None
        coords = np.array(
            [
                (x, y)
                for geom in gdf.geometry
                if geom is not None and not geom.is_empty
                for x, y in geom.coords
            ]
        )
        if len(coords) == 0:
            # Try extracting from multilinestrings
            coords = np.array(
                [
                    (x, y)
                    for geom in gdf.geometry
                    if geom is not None and not geom.is_empty
                    for part in (geom.geoms if hasattr(geom, "geoms") else [geom])
                    for x, y in part.coords
                ]
            )
        if len(coords) == 0:
            return None
        # Cell 6.3: flip (lon, lat) → (lat, lon) for haversine
        return BallTree(np.radians(coords[:, [1, 0]]), metric="haversine")

    def _nearest_road_distance_km(self, lat: float, lon: float, tree: BallTree | None) -> float:
        """Cell 6.4 — query the tree for the nearest road distance."""
        if tree is None or lat is None or lon is None:
            return float("nan")
        coords = np.radians(np.array([[lat, lon]]))
        dist, _ = tree.query(coords, k=1)
        return float(dist.flatten()[0] * EARTH_RADIUS_KM)

    # ------------------------------------------------------------------ public
    # Thin public accessors over the existing private distance query — same
    # BallTree, same haversine metric, same EARTH_RADIUS_KM multiplier.  No
    # second distance calculation: these just expose what
    # ``_nearest_road_distance_km`` already does so callers (e.g. the Deal
    # Finder's "tarmac road" filter) don't reach into ``_trees`` directly.
    def nearest_road_distance_km(self, lat: float, lon: float, road_classes: list[str]) -> float:
        """Distance to the nearest road in any of ``road_classes`` (km).

        Takes the **minimum** over the per-class trees — so for the Deal
        Finder's ``tarmac_road`` filter, the caller passes
        ``["primary", "trunk", "motorway"]`` (the OSM paved-road classes)
        and gets back the distance to the nearest paved road of any of
        those classes.  Returns NaN when none of the classes have a tree
        (e.g. the roads file is missing or none of the classes exist in
        ``road_weights``) or when the coordinate is NaN / None.
        """
        self._ensure_loaded()
        # Guard NaN / None coords — sklearn's BallTree.query raises on NaN.
        if lat is None or lon is None or not (np.isfinite(lat) and np.isfinite(lon)):
            return float("nan")
        result = self._nearest_road_distances_batch(
            np.asarray([lat], dtype=float),
            np.asarray([lon], dtype=float),
            road_classes,
        )
        # If all classes returned NaN (no trees), return NaN, not nanmin's
        # "All-NaN slice" RuntimeWarning.
        if not np.isfinite(result[0]):
            return float("nan")
        return float(result[0])

    def nearest_road_distances_km(
        self, lats: np.ndarray, lons: np.ndarray, road_classes: list[str]
    ) -> np.ndarray:
        """Vectorised distance query — same BallTree, same math as
        ``_nearest_road_distance_km``, just batched over many points.

        Returns a float array of length ``len(lats)``; NaN where no tree
        exists for any of ``road_classes`` or a coordinate is missing.
        """
        self._ensure_loaded()
        return self._nearest_road_distances_batch(
            np.asarray(lats, dtype=float),
            np.asarray(lons, dtype=float),
            road_classes,
        )

    def _nearest_road_distances_batch(
        self, lats: np.ndarray, lons: np.ndarray, road_classes: list[str]
    ) -> np.ndarray:
        """Internal: min-over-classes batch query.  Shared by the single-point
        and batch public methods so the math lives in one place."""
        # Filter to classes that actually have trees (some may be missing
        # from scoring_params["road_weights"] — e.g. "motorway" isn't always
        # configured).  Unknown classes are silently skipped.
        trees = [self._trees.get(rc) for rc in road_classes if rc in self._trees]
        trees = [t for t in trees if t is not None]
        if not trees:
            return np.full(len(lats), np.nan, dtype=float)
        valid = np.isfinite(lats) & np.isfinite(lons)
        out = np.full(len(lats), np.nan, dtype=float)
        if not valid.any():
            return out
        coords = np.radians(np.column_stack([lats[valid], lons[valid]]))
        # Query each tree, take the elementwise min across classes.
        per_class = []
        for tree in trees:
            if tree is None:
                continue
            dist, _ = tree.query(coords, k=1)
            per_class.append(dist.flatten() * EARTH_RADIUS_KM)
        if not per_class:
            return out
        out[valid] = np.nanmin(np.column_stack(per_class), axis=1)
        return out

    def _road_score_raw(self, lat: float, lon: float) -> float:
        """Cell 6.5 — max over road types of weight * exp(-ROAD_BETA * dist).

        Returns the pre-floor value (no description road-hint floors).
        """
        scores = {}
        for road_type, weight in self.road_weights.items():
            tree = self._trees.get(road_type)
            dist_km = self._nearest_road_distance_km(lat, lon, tree)
            if dist_km is not None and not np.isnan(dist_km):
                scores[road_type] = weight * np.exp(-self.road_beta * dist_km)
        if not scores:
            return 0.0
        return max(scores.values())

    def compute_score(
        self,
        lat: float,
        lon: float,
        reference_city_dist_km: float,
        dist_to_nairobi_km: float,
    ) -> float:
        """Compute ``accessibility_score_osm`` for a single point.

        Cell 6.8 formula with the pre-floor road component (Cell 6.5 copy).
        """
        self._ensure_loaded()

        # Cell 6.5 — road score (pre-floor, no description hints)
        road_score = np.clip(self._road_score_raw(lat, lon), 0, 1)

        # Cell 6.7 — town and Nairobi decay scores
        town_score = (
            np.exp(-self.town_beta * reference_city_dist_km)
            if reference_city_dist_km is not None and not np.isnan(reference_city_dist_km)
            else 0.0
        )
        nairobi_score = (
            np.exp(-self.nairobi_beta * dist_to_nairobi_km)
            if dist_to_nairobi_km is not None and not np.isnan(dist_to_nairobi_km)
            else 0.0
        )

        # Cell 6.8 — weighted sum, clipped, scaled
        raw = (
            self.score_weights["road"] * road_score
            + self.score_weights["town"] * town_score
            + self.score_weights["nairobi"] * nairobi_score
        )
        return round(np.clip(raw, 0, 1) * 100, 2)

    @property
    def load_time_s(self) -> float:
        self._ensure_loaded()
        return self._load_time_s

    @property
    def tree_counts(self) -> dict[str, int]:
        """Number of road vertices indexed per road class."""
        self._ensure_loaded()
        return {rt: (t.data.shape[0] if t is not None else 0) for rt, t in self._trees.items()}
