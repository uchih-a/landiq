"""PlacesIndex — Kenyan place-name gazetteer for the Price Predictor search box.

Loads ``kenya_places.gpkg`` (extracted by ``scripts/extract_poi_names.py``
from the OSM PBF's ``places`` layer) and provides:

  - ``search(q, limit)`` — ranked substring matches for the typeahead search
    box (``GET /api/v1/places/search?q=...``)
  - ``nearest_named_town(lat, lon)`` — nearest place to a coordinate, used
    both for the POI-name fallback in the extraction script and for the
    "nearest named town" diagnostic in the predict endpoint

The gazetteer is loaded once at startup and cached for the process
lifetime.  When the GPKG is absent (the extraction hasn't been run), the
service constructs with ``loaded=False`` and both methods return empty /
503 — the app still starts.

**Coverage limitations** (report, not silently present as authoritative):
The gazetteer is whatever the OSM community tagged with a ``place`` tag in
Kenya.  Informal settlement names (e.g. "Mukuru kwa Reuben"), newly-developed
suburbs, and estate names inside large cities are under-represented or
missing.  It is NOT a curated administrative dataset.
"""

from __future__ import annotations

import time
import tracemalloc
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger

logger = get_logger("app.places_index")

# Place-type ranking for search results (lower = more important).
# Source: https://wiki.openstreetmap.org/wiki/Key:place
_PLACE_TYPE_RANK = {
    "city": 0,
    "town": 1,
    "village": 2,
    "suburb": 3,
    "neighbourhood": 4,
    "quarter": 5,
    "hamlet": 6,
}


@dataclass
class PlaceMatch:
    """One search result row."""

    name: str
    place_type: str | None
    county: str | None
    subtitle: str
    latitude: float
    longitude: float
    population: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "place_type": self.place_type,
            "county": self.county,
            "subtitle": self.subtitle,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "population": self.population,
        }


@dataclass
class PlacesIndex:
    """Loads + caches the places gazetteer and its BallTree.

    Parameters
    ----------
    gpkg_path : str
        Path to ``kenya_places.gpkg``.  When the file doesn't exist, the
        index constructs with ``loaded=False`` and both methods return
        empty / None.
    """

    gpkg_path: str
    loaded: bool = False
    _df: pd.DataFrame | None = None
    _lats: np.ndarray | None = None
    _lons: np.ndarray | None = None
    _tree: Any = None  # sklearn.neighbors.BallTree
    _names_lower: np.ndarray | None = None  # lowercased names for substring search
    load_time_s: float = 0.0
    memory_mb: float = 0.0
    n_places: int = 0
    load_error: str = ""

    def load(self) -> PlacesIndex:
        """Load the GPKG and build the BallTree.  Safe to call when the file
        is missing — sets ``loaded=False`` and returns."""
        if not self._file_exists():
            self.loaded = False
            self.load_error = f"file not found: {self.gpkg_path}"
            logger.warning("places_index_missing", path=self.gpkg_path)
            return self

        t0 = time.perf_counter()
        tracemalloc.start()
        tracemalloc.reset_peak()
        try:
            import geopandas as gpd
            from sklearn.neighbors import BallTree

            gdf = gpd.read_file(self.gpkg_path)
            if len(gdf) == 0:
                self.loaded = False
                self.load_error = "gazetteer is empty"
                return self

            gdf = gdf[gdf.geometry.notna()].reset_index(drop=True)
            # Ensure expected columns exist
            for col in ("name", "place_type", "county", "subtitle", "population"):
                if col not in gdf.columns:
                    gdf[col] = None

            # Store as a plain DataFrame (drop geometry, keep lat/lon as cols)
            self._df = pd.DataFrame(
                {
                    "name": gdf["name"].astype(str),
                    "place_type": gdf["place_type"],
                    "county": gdf["county"],
                    "subtitle": gdf["subtitle"].fillna("").astype(str),
                    "population": gdf["population"],
                    "latitude": gdf.geometry.y.astype(float),
                    "longitude": gdf.geometry.x.astype(float),
                }
            )
            self._lats = self._df["latitude"].to_numpy(dtype=float)
            self._lons = self._df["longitude"].to_numpy(dtype=float)
            self._names_lower = self._df["name"].str.lower().to_numpy()

            # Build a haversine BallTree (same metric as B1's amenities)
            # Local bindings + asserts for mypy — _lats/_lons are set above
            # but the dataclass field type is ndarray | None.
            lats = self._lats
            lons = self._lons
            assert lats is not None and lons is not None
            coords = np.radians(np.column_stack([lats, lons]))
            self._tree = BallTree(coords, metric="haversine")

            self.n_places = len(self._df)
            self.loaded = True
        except Exception as e:
            self.loaded = False
            self.load_error = f"{type(e).__name__}: {e}"
            logger.error("places_index_load_failed", error=str(e))
        finally:
            _current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            self.load_time_s = round(time.perf_counter() - t0, 3)
            self.memory_mb = round(peak / (1024 * 1024), 1)

        if self.loaded:
            logger.info(
                "places_index_loaded",
                n_places=self.n_places,
                load_time_s=self.load_time_s,
                memory_mb=self.memory_mb,
            )
        return self

    def _file_exists(self) -> bool:
        import os

        return os.path.exists(self.gpkg_path)

    # ------------------------------------------------------------------ search
    def search(self, q: str, limit: int = 10) -> list[PlaceMatch]:
        """Ranked substring search over place names.

        Ranking (highest first):
          1. Exact match (case-insensitive)
          2. Starts-with match
          3. Substring match
          4. Within each tier, by place-type importance (city > town > village)
          5. Within each place-type, by population (desc), then alphabetically
        """
        if not self.loaded or self._df is None or self._names_lower is None:
            return []
        ql = q.lower().strip()
        if not ql:
            return []

        names_lower = self._names_lower
        exact = []
        starts = []
        substr = []
        for i, name_lower in enumerate(names_lower):
            if name_lower == ql:
                exact.append(i)
            elif name_lower.startswith(ql):
                starts.append(i)
            elif ql in name_lower:
                substr.append(i)

        # Sort each tier by place-type rank, then population desc, then name
        def sort_key(idx: int) -> tuple:
            row = self._df.iloc[idx]  # type: ignore[union-attr]
            pt_rank = _PLACE_TYPE_RANK.get(row["place_type"], 99)
            pop = row["population"]
            try:
                pop_val = -float(pop) if pd.notna(pop) else 0.0
            except (TypeError, ValueError):
                pop_val = 0.0
            return (pt_rank, pop_val, str(row["name"]))

        ranked_indices = sorted(exact, key=sort_key)
        ranked_indices += sorted(starts, key=sort_key)
        ranked_indices += sorted(substr, key=sort_key)

        results: list[PlaceMatch] = []
        for idx in ranked_indices[:limit]:
            row = self._df.iloc[idx]  # type: ignore[union-attr]
            results.append(
                PlaceMatch(
                    name=str(row["name"]),
                    place_type=row["place_type"],
                    county=row["county"],
                    subtitle=str(row["subtitle"]),
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    population=int(row["population"]) if pd.notna(row["population"]) else None,
                )
            )
        return results

    # ------------------------------------------------------------------ nearest
    def nearest_named_town(self, lat: float, lon: float) -> PlaceMatch | None:
        """Return the nearest place to (lat, lon), or None when the index
        is empty / the coordinate is NaN."""
        if not self.loaded or self._tree is None or self._df is None:
            return None
        if not (np.isfinite(lat) and np.isfinite(lon)):
            return None
        coords = np.radians(np.array([[lat, lon]]))
        dist, idx = self._tree.query(coords, k=1)
        row = self._df.iloc[int(idx.flatten()[0])]
        return PlaceMatch(
            name=str(row["name"]),
            place_type=row["place_type"],
            county=row["county"],
            subtitle=str(row["subtitle"]),
            latitude=float(row["latitude"]),
            longitude=float(row["longitude"]),
            population=int(row["population"]) if pd.notna(row["population"]) else None,
        )

    def status(self) -> dict[str, Any]:
        return {
            "loaded": self.loaded,
            "n_places": self.n_places,
            "load_time_s": self.load_time_s,
            "memory_mb": self.memory_mb,
            "load_error": self.load_error,
        }
