"""County assignment by point-in-polygon — mirrors Notebook 1 Cell 4.10.

The county polygon file is the GADM shapefile (``kenya_counties.gpkg``,
layer ``ADM_ADM_1``) downloaded by Cell 4.9. The notebook reads it with
geopandas, renames ``NAME_1`` to ``county``, and reprojects to EPSG:4326
before doing a spatial join.

A spatial index (``sindex``) is used so only candidate polygons near the
query point are tested, not all 47.
"""

from __future__ import annotations

import geopandas as gpd
from shapely.geometry import Point

# Kenya bounding box — same as KE_BOUNDS in Cell 3.3
KE_BOUNDS = {"lat": (-4.72, 4.62), "lon": (33.91, 41.91)}


class CountyLookup:
    """Loads the county polygon file once and answers point-in-polygon queries.

    Parameters
    ----------
    counties_path : str
        Path to ``kenya_counties.gpkg`` (GADM, layer ``ADM_ADM_1``).
    """

    def __init__(self, counties_path: str):
        self.path = counties_path
        self._gdf: gpd.GeoDataFrame | None = None
        self._load_time_s: float = 0.0

    def _ensure_loaded(self) -> None:
        if self._gdf is not None:
            return
        import time

        t0 = time.perf_counter()
        gdf = gpd.read_file(self.path, layer="ADM_ADM_1")
        gdf = gdf[["NAME_1", "geometry"]].rename(columns={"NAME_1": "county"})
        gdf = gdf.to_crs("EPSG:4326")
        self._gdf = gdf
        self._load_time_s = time.perf_counter() - t0

    @property
    def load_time_s(self) -> float:
        self._ensure_loaded()
        return self._load_time_s

    @property
    def memory_mb(self) -> float:
        self._ensure_loaded()
        return self._gdf.memory_usage(deep=True).sum() / 1e6

    def assign_county(self, lat: float, lon: float) -> str | None:
        """Return the county name for a (lat, lon) point, or None if outside Kenya.

        Raises
        ------
        ValueError
            If the point is outside the Kenya bounding box.
        """
        self._ensure_loaded()

        # Bounding-box guard — same bounds as Cell 3.3 KE_BOUNDS
        if not (
            KE_BOUNDS["lat"][0] <= lat <= KE_BOUNDS["lat"][1]
            and KE_BOUNDS["lon"][0] <= lon <= KE_BOUNDS["lon"][1]
        ):
            raise ValueError(
                f"Point ({lat}, {lon}) is outside the Kenya bounding box "
                f"(lat {KE_BOUNDS['lat']}, lon {KE_BOUNDS['lon']})."
            )

        point = Point(lon, lat)  # shapely uses (lon, lat)
        # Use spatial index for efficiency
        candidate_idx = list(self._gdf.sindex.query(point, predicate="intersects"))
        for idx in candidate_idx:
            row = self._gdf.iloc[idx]
            if row.geometry.contains(point) or row.geometry.touches(point):
                return row["county"]
        # Point might be exactly on a boundary or in a gap — try broader query
        for idx in candidate_idx:
            row = self._gdf.iloc[idx]
            if row.geometry.intersects(point):
                return row["county"]
        return None

    def assign_county_batch(self, lats: list[float], lons: list[float]) -> list[str | None]:
        """Vectorised batch lookup — returns a list of county names."""
        self._ensure_loaded()
        points = gpd.GeoDataFrame(
            geometry=[Point(lo, la) for la, lo in zip(lats, lons, strict=False)],
            crs="EPSG:4326",
        )
        joined = gpd.sjoin(points, self._gdf, how="left", predicate="within")
        return [v if isinstance(v, str) else None for v in joined["county"]]
