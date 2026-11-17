"""NamedPOIIndex — named points-of-interest for the predict endpoint's
"Nearby & Infrastructure" list.

Loads ``kenya_pois_named.gpkg`` (extracted by ``scripts/extract_poi_names.py``
— the same ogr2ogr command as Notebook 1 Cell 5.2 but with ``name`` added to
the ``-select`` list) and builds per-category BallTrees for the
``GET /api/v1/places/nearby?lat&lon&radius_km`` endpoint.

The categories mirror Notebook 1 Cell 5.0's ``AMENITY_FILTERS`` (hospital,
school, market, bank, police, bus_stop, fuel) so the named POIs stay
consistent with the scores B1's AmenitiesCalculator already computes from
the unnamed ``kenya_pois.gpkg``.

**Coverage limitations** (report, not silently present as authoritative):
The named-POI layer is whatever OSM contributors tagged with a ``name`` in
Kenya.  POIs without a name in OSM fall back to ``"<category> near
<nearest town>"`` (assigned by the extraction script) — these are labels,
not real names.  The layer is NOT a curated business directory.
"""

from __future__ import annotations

import time
import tracemalloc
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

from app.core.logging import get_logger
from landval.features.geo import EARTH_RADIUS_KM

logger = get_logger("app.named_poi_index")

# Same categories as Notebook 1 Cell 5.0 AMENITY_FILTERS.
POI_CATEGORIES = ("hospital", "school", "market", "bank", "police", "bus_stop", "fuel")


@dataclass
class NamedPOI:
    """One named POI returned by the nearby lookup."""

    name: str
    category: str
    amenity: str | None
    shop: str | None
    highway: str | None
    latitude: float
    longitude: float
    distance_km: float
    is_fallback: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "category": self.category,
            "amenity": self.amenity,
            "shop": self.shop,
            "highway": self.highway,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "distance_km": self.distance_km,
            "is_fallback": self.is_fallback,
        }


def _is_fallback_name(name: str, category: str) -> bool:
    """Detect whether a POI name is a generated fallback label.

    The extraction script (``scripts/extract_poi_names.py``) generates
    fallback names as ``"<category> near <town>"`` when an OSM feature has
    no ``name`` tag.  We detect these by checking whether the name starts
    with ``"<category> near "`` — this is reliable because the extraction
    script always uses the exact category label as the prefix, and a real
    OSM name starting with e.g. ``"hospital near"`` is extremely unlikely.
    """
    if not name or not category:
        return False
    return name.lower().startswith(f"{category.lower()} near ")


@dataclass
class NamedPOIIndex:
    """Loads + caches the named-POI layer and per-category BallTrees.

    Parameters
    ----------
    gpkg_path : str
        Path to ``kenya_pois_named.gpkg``.  When the file doesn't exist,
        the index constructs with ``loaded=False``.
    """

    gpkg_path: str
    loaded: bool = False
    _df: pd.DataFrame | None = None
    # Per-category BallTrees + coordinate arrays
    _trees: dict[str, BallTree | None] = field(default_factory=dict)
    _cat_indices: dict[str, np.ndarray] = field(default_factory=dict)
    load_time_s: float = 0.0
    memory_mb: float = 0.0
    n_pois: int = 0
    n_per_category: dict[str, int] = field(default_factory=dict)
    load_error: str = ""

    # ------------------------------------------------------------------ AMENITY_FILTERS
    # Copied verbatim from Notebook 1 Cell 5.0 (must match the categories
    # B1's AmenitiesCalculator builds trees for, so the named POIs returned
    # here are from the same OSM features the model's distance features
    # were computed against).
    AMENITY_FILTERS: dict[str, dict[str, list[str]]] = field(
        default_factory=lambda: {
            "hospital": {
                "amenity": ["hospital", "clinic", "dispensary", "health_centre", "health_center"]
            },
            "school": {"amenity": ["school", "university", "college", "kindergarten"]},
            "market": {"amenity": ["marketplace"], "shop": ["supermarket", "mall", "convenience"]},
            "bank": {"amenity": ["bank", "atm", "microfinance"]},
            "police": {"amenity": ["police"]},
            "bus_stop": {"highway": ["bus_stop"], "amenity": ["bus_station"]},
            "fuel": {"amenity": ["fuel"]},
        }
    )

    def load(self) -> NamedPOIIndex:
        """Load the GPKG and build per-category BallTrees."""
        import os

        if not os.path.exists(self.gpkg_path):
            self.loaded = False
            self.load_error = f"file not found: {self.gpkg_path}"
            logger.warning("named_poi_index_missing", path=self.gpkg_path)
            return self

        t0 = time.perf_counter()
        tracemalloc.start()
        tracemalloc.reset_peak()
        try:
            import geopandas as gpd

            gdf = gpd.read_file(self.gpkg_path)
            if len(gdf) == 0:
                self.loaded = False
                self.load_error = "named POI layer is empty"
                return self

            gdf = gdf[gdf.geometry.notna()].reset_index(drop=True)
            for col in ("name", "amenity", "shop", "highway"):
                if col not in gdf.columns:
                    gdf[col] = None

            # Assign each POI to a category (the first AMENITY_FILTERS entry
            # whose tag values match).  POIs that don't match any category
            # are kept but not indexed in any per-category tree — they're
            # not queryable via the category filter.
            gdf["_category"] = gdf.apply(self._assign_category, axis=1)

            self._df = pd.DataFrame(
                {
                    "name": gdf["name"].fillna("").astype(str),
                    "category": gdf["_category"],
                    "amenity": gdf["amenity"],
                    "shop": gdf["shop"],
                    "highway": gdf["highway"],
                    "latitude": gdf.geometry.y.astype(float),
                    "longitude": gdf.geometry.x.astype(float),
                }
            )

            # Build per-category BallTrees
            lats_all = self._df["latitude"].to_numpy(dtype=float)
            lons_all = self._df["longitude"].to_numpy(dtype=float)
            valid_all = np.isfinite(lats_all) & np.isfinite(lons_all)

            for cat in POI_CATEGORIES:
                cat_mask = (self._df["category"] == cat) & valid_all
                indices = np.where(cat_mask.to_numpy())[0]
                self._cat_indices[cat] = indices
                self.n_per_category[cat] = int(len(indices))
                if len(indices) == 0:
                    self._trees[cat] = None
                    continue
                coords = np.radians(np.column_stack([lats_all[indices], lons_all[indices]]))
                self._trees[cat] = BallTree(coords, metric="haversine")

            self.n_pois = len(self._df)
            self.loaded = True
        except Exception as e:
            self.loaded = False
            self.load_error = f"{type(e).__name__}: {e}"
            logger.error("named_poi_index_load_failed", error=str(e))
        finally:
            _current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            self.load_time_s = round(time.perf_counter() - t0, 3)
            self.memory_mb = round(peak / (1024 * 1024), 1)

        if self.loaded:
            logger.info(
                "named_poi_index_loaded",
                n_pois=self.n_pois,
                n_per_category=self.n_per_category,
                load_time_s=self.load_time_s,
                memory_mb=self.memory_mb,
            )
        return self

    def _assign_category(self, row) -> str | None:
        """Map a POI's amenity/shop/highway tags to one of POI_CATEGORIES."""
        amenity = row.get("amenity")
        shop = row.get("shop")
        highway = row.get("highway")
        for cat, filters in self.AMENITY_FILTERS.items():
            if "amenity" in filters and amenity in filters["amenity"]:
                return cat
            if "shop" in filters and shop in filters["shop"]:
                return cat
            if "highway" in filters and highway in filters["highway"]:
                return cat
        return None

    # ------------------------------------------------------------------ nearby
    def nearby_named_pois(
        self,
        lat: float,
        lon: float,
        radius_km: float = 5.0,
        category: str | None = None,
        limit: int = 20,
    ) -> list[NamedPOI]:
        """Return named POIs within ``radius_km`` of (lat, lon), sorted by distance.

        When ``category`` is None, searches all categories.  When ``category``
        is one of :data:`POI_CATEGORIES`, searches only that category's tree.
        """
        if not self.loaded or self._df is None:
            return []
        if not (np.isfinite(lat) and np.isfinite(lon)):
            return []

        # Query each category's tree (or just the requested one)
        categories_to_query = [category] if category else list(POI_CATEGORIES)
        radius_radians = float(radius_km) / EARTH_RADIUS_KM

        all_hits: list[tuple[float, int]] = []  # (distance_km, df_index)
        for cat in categories_to_query:
            tree = self._trees.get(cat)
            if tree is None:
                continue
            cat_indices = self._cat_indices.get(cat, np.array([]))
            if len(cat_indices) == 0:
                continue
            coords = np.radians(np.array([[lat, lon]]))
            # query_radius returns (indices, distances) where indices are into
            # the tree's own coordinate array (i.e. into cat_indices), NOT
            # into the original DataFrame.  Map back through cat_indices.
            tree_indices, distances = tree.query_radius(
                coords, r=radius_radians, return_distance=True
            )
            # tree_indices and distances are lists of arrays (one per query point)
            for tree_idx, dist in zip(tree_indices[0], distances[0], strict=False):
                df_idx = int(cat_indices[int(tree_idx)])
                all_hits.append((float(dist) * EARTH_RADIUS_KM, df_idx))

        if not all_hits:
            return []

        # Sort by distance, take top ``limit``
        all_hits.sort(key=lambda h: h[0])
        results: list[NamedPOI] = []
        for dist_km, df_idx in all_hits[:limit]:
            row = self._df.iloc[df_idx]
            name = str(row["name"])
            category = str(row["category"]) if pd.notna(row["category"]) else "other"
            results.append(
                NamedPOI(
                    name=name,
                    category=category,
                    amenity=row["amenity"],
                    shop=row["shop"],
                    highway=row["highway"],
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    distance_km=round(dist_km, 3),
                    is_fallback=_is_fallback_name(name, category),
                )
            )
        return results

    def status(self) -> dict[str, Any]:
        return {
            "loaded": self.loaded,
            "n_pois": self.n_pois,
            "n_per_category": self.n_per_category,
            "load_time_s": self.load_time_s,
            "memory_mb": self.memory_mb,
            "load_error": self.load_error,
        }
