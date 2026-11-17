"""CountyBoundariesIndex — simplified GeoJSON for the Market Insights choropleth.

Loads ``kenya_counties_simplified.geojson`` (produced by
``scripts/download_county_boundaries.py`` — the GADM Level 1 county
boundaries from Cell 4.9's source, simplified via Douglas-Peucker to keep
the file light for page-load rendering) once at startup and caches it as
both a GeoDataFrame (for spatial queries) and a raw JSON string (for the
``GET /api/v1/counties/boundaries`` endpoint to return without re-serialising
on every request).

The simplified GeoJSON is for **rendering only** — B1's county lookup
(``kenya_counties.gpkg``, the full-resolution GPKG) is still the source for
point-in-polygon county assignment.  This file is a sibling artifact, not
a replacement.
"""

from __future__ import annotations

import json
import os
import time
import tracemalloc
from dataclasses import dataclass, field
from typing import Any

from app.core.logging import get_logger

logger = get_logger("app.county_boundaries")


@dataclass
class CountyBoundariesIndex:
    """Loads + caches the simplified county-boundaries GeoJSON.

    Parameters
    ----------
    geojson_path : str
        Path to ``kenya_counties_simplified.geojson``.  When the file
        doesn't exist, the index constructs with ``loaded=False`` and
        ``get_geojson()`` returns None (the endpoint returns 503).
    """

    geojson_path: str
    loaded: bool = False
    _geojson_str: str | None = None
    _geojson_dict: dict[str, Any] | None = None
    _county_names: list[str] = field(default_factory=list)
    load_time_s: float = 0.0
    memory_mb: float = 0.0
    n_counties: int = 0
    file_size_mb: float = 0.0
    load_error: str = ""

    def load(self) -> CountyBoundariesIndex:
        """Load the GeoJSON file once.  Safe to call when the file is missing."""
        if not os.path.exists(self.geojson_path):
            self.loaded = False
            self.load_error = f"file not found: {self.geojson_path}"
            logger.warning("county_boundaries_missing", path=self.geojson_path)
            return self

        t0 = time.perf_counter()
        tracemalloc.start()
        tracemalloc.reset_peak()
        try:
            self.file_size_mb = round(os.path.getsize(self.geojson_path) / 1e6, 3)
            # Read the raw JSON string once — the /boundaries endpoint returns
            # it verbatim without re-serialising on every request.
            with open(self.geojson_path) as f:
                self._geojson_str = f.read()
            # Parse once for the county-names list + spatial queries
            parsed = json.loads(self._geojson_str)
            self._geojson_dict = parsed
            features = parsed.get("features", [])
            self._county_names = [f.get("properties", {}).get("county", "") for f in features]
            self.n_counties = len(features)
            self.loaded = True
        except Exception as e:
            self.loaded = False
            self.load_error = f"{type(e).__name__}: {e}"
            logger.error("county_boundaries_load_failed", error=str(e))
        finally:
            _current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            self.load_time_s = round(time.perf_counter() - t0, 3)
            self.memory_mb = round(peak / (1024 * 1024), 1)

        if self.loaded:
            logger.info(
                "county_boundaries_loaded",
                n_counties=self.n_counties,
                file_size_mb=self.file_size_mb,
                load_time_s=self.load_time_s,
                memory_mb=self.memory_mb,
            )
        return self

    def get_geojson_str(self) -> str | None:
        """Return the raw GeoJSON string (for the /boundaries endpoint).

        The string is read once at load time and cached — no disk I/O on
        every request.  Returns None when the index isn't loaded.
        """
        return self._geojson_str

    def get_geojson_dict(self) -> dict[str, Any] | None:
        """Return the parsed GeoJSON as a dict (for spatial queries)."""
        return self._geojson_dict

    @property
    def county_names(self) -> list[str]:
        """The list of county names in the GeoJSON (for the per-county endpoint's
        path-parameter validation)."""
        return list(self._county_names)

    def status(self) -> dict[str, Any]:
        return {
            "loaded": self.loaded,
            "n_counties": self.n_counties,
            "file_size_mb": self.file_size_mb,
            "load_time_s": self.load_time_s,
            "memory_mb": self.memory_mb,
            "load_error": self.load_error,
        }
