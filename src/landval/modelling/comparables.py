"""ComparablesService — nearby-listing comparables for the predict response.

Given the predicted point (lat, lon, county), finds nearby listings in
``listings_scored.parquet`` (Cell 9.6) within ``COVERAGE_RADIUS_KM`` (default
50 km, from ``coverage_rules.json``), ranked by haversine distance
ascending.  Returns size, county / location, asking price per acre, model
estimate per acre, verdict (underpriced / fair / overpriced) and distance.

The 50 km haversine check reuses B1's ``haversine_km_vectorised`` (same
formula, same earth radius 6371.0 km as Cell 9.9's pairwise matrix) —
deliberately the same function ``PredictionService`` uses for its
nearby-listings coverage count, so the comparable set and the coverage
count stay consistent.

**Notebook 1's ``list_date`` is empty for every listing** — there is no
real "days ago" to compute.  This service OMITS the ``list_date`` /
``days_ago`` field entirely rather than fabricating a value; the final
reply flags this decision.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from landval.features.geo import haversine_km_vectorised

# Columns read from listings_scored.parquet (Cell 9.6).  Restricting the
# read to these keeps memory low even on the full modelling frame.
_COMPARABLE_COLUMNS = [
    "listing_no",
    "title",
    "location",
    "county",
    "latitude",
    "longitude",
    "size_acres",
    "listed_price_per_acre_ksh",
    "predicted_price_per_acre_ksh",
    "verdict",
]


@dataclass
class ComparableListing:
    """One nearby listing returned as a comparable."""

    listing_no: str | None
    title: str | None
    location: str | None
    county: str | None
    size_acres: float
    listed_price_per_acre_ksh: float
    predicted_price_per_acre_ksh: float
    verdict: str
    distance_km: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "listing_no": self.listing_no,
            "title": self.title,
            "location": self.location,
            "county": self.county,
            "size_acres": self.size_acres,
            "listed_price_per_acre_ksh": self.listed_price_per_acre_ksh,
            "predicted_price_per_acre_ksh": self.predicted_price_per_acre_ksh,
            "verdict": self.verdict,
            "distance_km": self.distance_km,
        }


class ComparablesService:
    """One instance per process — holds the loaded ``listings_scored`` frame.

    Parameters
    ----------
    listings_scored_df : pandas.DataFrame | None
        The parsed ``app_exports/listings_scored.parquet`` (Cell 9.6).
        ``None`` when the file is missing — ``find_comparables`` returns an
        empty list in that case (the caller surfaces this as "no
        comparables available", not an error, since the prediction itself
        is still valid).
    coverage_rules : dict | None
        Parsed ``backend_exports/coverage_rules.json`` (Cell 9.9).  Used
        for the default ``COVERAGE_RADIUS_KM``.
    """

    def __init__(
        self,
        listings_scored_df: pd.DataFrame | None,
        coverage_rules: dict[str, Any] | None,
    ):
        self.df = listings_scored_df
        self.coverage_rules = coverage_rules or {}
        # Pre-extract the coordinate arrays once so every request reuses
        # them — a 10k-row frame is ~80 KB per array, negligible.
        self._lats: np.ndarray | None = None
        self._lons: np.ndarray | None = None
        self._valid_mask: np.ndarray | None = None
        if self.df is not None and len(self.df) > 0:
            self._lats = self.df["latitude"].to_numpy(dtype=float)
            self._lons = self.df["longitude"].to_numpy(dtype=float)
            self._valid_mask = (
                self.df["latitude"].notna().to_numpy() & self.df["longitude"].notna().to_numpy()
            )

    # ------------------------------------------------------------------ public
    def find_comparables(
        self,
        lat: float,
        lon: float,
        county: str | None = None,
        limit: int = 10,
        radius_km: int | None = None,
    ) -> list[ComparableListing]:
        """Find the nearest ``limit`` listings within ``radius_km`` of (lat, lon).

        Listings with missing coordinates are skipped.  The exact input
        point (distance < 1 m, which happens when the prediction point
        coincides with a modelling-frame listing) is excluded — the same
        self-distance exclusion Cell 9.9 applies.

        ``county`` is accepted for symmetry with the coverage check but not
        used as a filter here: a 50 km radius around a point on a county
        boundary legitimately includes listings in the neighbouring county,
        and excluding them would make the comparable set look artificially
        thin.
        """
        if self.df is None or self._lats is None or self._lons is None or self._valid_mask is None:
            return []
        if not self._valid_mask.any():
            return []

        radius = float(
            radius_km
            if radius_km is not None
            else self.coverage_rules.get("COVERAGE_RADIUS_KM", 50)
        )

        # Vectorised haversine from B1's geo module — same formula and earth
        # radius (6371.0 km) as Cell 9.9's pairwise matrix.  Local bindings
        # tell mypy the arrays are non-None after the guard above.
        lats = self._lats
        lons = self._lons
        dists = haversine_km_vectorised(lats, lons, lat, lon)

        # Mask: valid coordinate AND within radius AND not the exact point.
        mask = self._valid_mask & (dists <= radius) & (dists > 1e-4)
        if not mask.any():
            return []

        # Sort by distance ascending, take the top ``limit``.
        idx_within = np.where(mask.to_numpy() if hasattr(mask, "to_numpy") else mask)[0]
        idx_sorted = idx_within[np.argsort(dists[idx_within])]
        if limit > 0:
            idx_sorted = idx_sorted[:limit]

        comparables: list[ComparableListing] = []
        for i in idx_sorted:
            row = self.df.iloc[int(i)]
            comparables.append(
                ComparableListing(
                    listing_no=_maybe(row.get("listing_no")),
                    title=_maybe(row.get("title")),
                    location=_maybe(row.get("location")),
                    county=_maybe(row.get("county")),
                    size_acres=float(row["size_acres"]),
                    listed_price_per_acre_ksh=float(row["listed_price_per_acre_ksh"]),
                    predicted_price_per_acre_ksh=float(row["predicted_price_per_acre_ksh"]),
                    verdict=str(row["verdict"]),
                    distance_km=round(float(dists[int(i)]), 2),
                )
            )
        return comparables

    # ------------------------------------------------------------------ report
    def status(self) -> dict[str, Any]:
        """JSON-friendly status for /meta-style introspection."""
        return {
            "listings_loaded": self.df is not None,
            "n_listings": int(len(self.df)) if self.df is not None else 0,
        }


def _maybe(v: Any) -> Any:
    """NaN / pandas NA -> None for clean JSON."""
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v
