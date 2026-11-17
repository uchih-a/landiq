"""Proximity features — mirrors Notebook 1 Cells 4.4 and 4.13.

All formulas, constants, and rounding are copied exactly from the notebook.
Configurable values (county towns, water bodies, Nairobi CBD, adjacent
counties) come from ``reference_data.json`` at init time.
"""

from __future__ import annotations

import numpy as np

from landval.features.geo import haversine_km


class ProximityCalculator:
    """Computes proximity features from a (lat, lon) point and a county.

    Parameters
    ----------
    reference_data : dict
        The parsed ``reference_data.json`` — county_towns, water_bodies,
        nairobi_adjacent_counties.
    scoring_params : dict
        The parsed ``scoring_params.json`` — nairobi_reference_point.
    """

    def __init__(self, reference_data: dict, scoring_params: dict):
        ref = scoring_params.get("nairobi_reference_point", {})
        self.nairobi_cbd = (
            ref.get("latitude", -1.2921),
            ref.get("longitude", 36.8219),
        )

        # county_towns: {county: {latitude, longitude}}
        self.county_towns = {
            c: (v["latitude"], v["longitude"]) for c, v in reference_data["county_towns"].items()
        }

        # water_bodies: {county: [{name, latitude, longitude}, ...]}
        self.water_bodies = {
            c: [(b["latitude"], b["longitude"]) for b in bodies]
            for c, bodies in reference_data["water_bodies"].items()
        }

        self.nairobi_adjacent = set(reference_data.get("nairobi_adjacent_counties", []))

    def dist_to_nairobi_km(self, lat: float, lon: float) -> float:
        """Cell 4.4: round(haversine_km(lat, lon, NAIROBI_CBD), 2)."""
        if lat is None or lon is None or (isinstance(lat, float) and np.isnan(lat)):
            return float("nan")
        return round(haversine_km(lat, lon, *self.nairobi_cbd), 2)

    def dist_to_county_town_km(self, lat: float, lon: float, county: str | None) -> float:
        """Cell 4.4: round(haversine_km(lat, lon, *COUNTY_TOWNS[county]), 2).

        NaN when county is None or not in COUNTY_TOWNS.
        """
        if lat is None or lon is None or county is None or county not in self.county_towns:
            return float("nan")
        return round(haversine_km(lat, lon, *self.county_towns[county]), 2)

    def dist_to_water_body_km(self, lat: float, lon: float, county: str | None) -> float:
        """Cell 4.4: round(min(haversine to each water body), 2).

        NaN when the county is not in WATER_BODIES (by design — only 12
        counties border a water body).
        """
        if lat is None or lon is None or county is None or county not in self.water_bodies:
            return float("nan")
        return round(
            min(haversine_km(lat, lon, wlat, wlon) for wlat, wlon in self.water_bodies[county]),
            2,
        )

    def reference_city_and_dist(
        self, lat: float, lon: float, county: str | None
    ) -> tuple[str | float, float, float]:
        """Cell 4.13 ``get_reference_city_v2`` — returns
        (reference_city, reference_city_dist_km, dist_to_county_town_km).

        The third value is what Cell 4.13 assigns to ``dist_to_county_town_km``,
        overwriting the Cell 4.4 computation.

        .. note::
           The notebook's Cell 4.13 returns ``round(dist_nairobi, 2)`` as the
           third value when the county town is the reference city (the common
           case for non-Nairobi-adjacent counties). This means
           ``dist_to_county_town_km`` in the engineered dataset is the distance
           to **Nairobi**, not to the county town, for those rows. This
           appears to be a swap in the return values — see the mismatch report.
           The backend replicates the notebook's behaviour exactly so parity
           holds against ``parity_fixture.parquet``.
        """
        if lat is None or lon is None or county is None:
            return float("nan"), float("nan"), float("nan")

        town_coords = self.county_towns.get(county)
        dist_nairobi = haversine_km(lat, lon, *self.nairobi_cbd)
        dist_town = haversine_km(lat, lon, *town_coords) if town_coords else float("nan")

        # Cell 4.13 case 1: Nairobi-adjacent and Nairobi is closer
        if county in self.nairobi_adjacent and town_coords is not None and dist_nairobi < dist_town:
            return "Nairobi", round(dist_nairobi, 2), round(dist_town, 2)

        # Cell 4.13 case 2: county town is the reference
        if town_coords is not None:
            # NOTE: the notebook returns round(dist_nairobi, 2) here — see docstring
            return county, round(dist_town, 2), round(dist_nairobi, 2)

        # Cell 4.13 case 3: fallback (no town coords)
        return "Nairobi", round(dist_nairobi, 2), float("nan")
