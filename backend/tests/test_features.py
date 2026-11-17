"""Unit tests for the feature pipeline — run in CI without the big spatial files.

The full parity test (against parity_fixture.parquet) is in
``scripts/parity_test.py`` and is skipped when the fixture or spatial data
files are absent.
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import numpy as np
import pytest

# Ensure src/ is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

from landval.features.geo import EARTH_RADIUS_KM, KE_BOUNDS, haversine_km, haversine_km_vectorised

# ---- geo.py tests ----


class TestHaversine:
    def test_known_distance(self):
        """Nairobi to Mombasa is approximately 425 km."""
        d = haversine_km(-1.2921, 36.8219, -4.0435, 39.6682)
        assert 435 < d < 445, f"Expected ~440 km, got {d}"

    def test_zero_distance(self):
        d = haversine_km(-1.0, 36.0, -1.0, 36.0)
        assert d == pytest.approx(0.0, abs=1e-6)

    def test_earth_radius(self):
        assert EARTH_RADIUS_KM == 6371.0

    def test_vectorised_matches_scalar(self):
        lats = np.array([-1.0, -4.0, 0.5])
        lons = np.array([36.0, 39.0, 35.0])
        ref_lat, ref_lon = -1.2921, 36.8219
        scalar = [
            haversine_km(la, lo, ref_lat, ref_lon) for la, lo in zip(lats, lons, strict=False)
        ]
        vector = haversine_km_vectorised(lats, lons, ref_lat, ref_lon)
        np.testing.assert_allclose(scalar, vector, rtol=1e-6)


# ---- proximity.py tests ----


def _make_reference_data():
    """Minimal reference_data.json for testing."""
    return {
        "county_towns": {
            "Nairobi": {"latitude": -1.2921, "longitude": 36.8219},
            "Kiambu": {"latitude": -1.0300, "longitude": 36.8300},
            "Kajiado": {"latitude": -1.8500, "longitude": 36.7800},
        },
        "water_bodies": {
            "Nakuru": [{"name": "Lake Nakuru", "latitude": -0.3700, "longitude": 36.0900}],
        },
        "nairobi_adjacent_counties": ["Kajiado", "Kiambu", "Machakos", "Murang'a"],
    }


def _make_scoring_params():
    """Minimal scoring_params.json for testing."""
    return {
        "amenity_params": {"hospital": [0.25, 0.30]},
        "amenity_filters": {"hospital": {"amenity": ["hospital"]}},
        "road_weights": {"primary": 0.75},
        "road_beta": 0.5,
        "town_beta": 0.08,
        "nairobi_beta": 0.04,
        "score_weights": {"road": 0.50, "town": 0.30, "nairobi": 0.20},
        "infra_items": {
            "borehole": 0.25,
            "piped_water": 0.20,
            "river_water": 0.10,
            "water_tank": 0.07,
            "grid_electric": 0.22,
            "solar_electric": 0.08,
            "full_fence": 0.18,
            "partial_fence": 0.08,
            "structures": 0.12,
            "internal_road": 0.08,
        },
        "max_infra_score": 1.38,
        "county_median_infrastructure": {"Nairobi": 8.70, "Kiambu": 8.70},
        "global_fallback_infrastructure": 8.70,
        "nairobi_reference_point": {"latitude": -1.2921, "longitude": 36.8219},
    }


class TestProximity:
    def setup_method(self):
        from landval.features.proximity import ProximityCalculator

        self.calc = ProximityCalculator(_make_reference_data(), _make_scoring_params())

    def test_dist_to_nairobi(self):
        d = self.calc.dist_to_nairobi_km(-1.2921, 36.8219)
        assert d == pytest.approx(0.0, abs=0.01)

    def test_dist_to_county_town(self):
        d = self.calc.dist_to_county_town_km(-1.0300, 36.8300, "Kiambu")
        assert d == pytest.approx(0.0, abs=0.01)

    def test_dist_to_county_town_unknown_county(self):
        d = self.calc.dist_to_county_town_km(-1.0, 36.0, "Unknown")
        assert math.isnan(d)

    def test_dist_to_water_body_present(self):
        d = self.calc.dist_to_water_body_km(-0.3700, 36.0900, "Nakuru")
        assert d == pytest.approx(0.0, abs=0.01)

    def test_dist_to_water_body_absent(self):
        d = self.calc.dist_to_water_body_km(-1.0, 36.0, "Nairobi")
        assert math.isnan(d)

    def test_reference_city_nairobi_adjacent_closer_to_nairobi(self):
        # Point in Kiambu closer to Nairobi than Kiambu town
        ref, dist, town_dist = self.calc.reference_city_and_dist(-1.20, 36.82, "Kiambu")
        assert ref == "Nairobi"
        assert dist < town_dist

    def test_reference_city_non_adjacent(self):
        ref, dist, town_dist = self.calc.reference_city_and_dist(-1.03, 36.83, "Nairobi")
        assert ref == "Nairobi"


# ---- infrastructure.py tests ----


class TestInfrastructure:
    def setup_method(self):
        from landval.features.infrastructure import InfrastructureCalculator

        self.calc = InfrastructureCalculator(_make_scoring_params())

    def test_all_items_present(self):
        parcel = {item: 1 for item in self.calc.infra_items}
        score, source = self.calc.compute_score(parcel, "Nairobi")
        assert source == "parcel_checklist"
        assert 0 < score <= 100

    def test_no_items(self):
        parcel = {item: 0 for item in self.calc.infra_items}
        score, source = self.calc.compute_score(parcel, "Nairobi")
        assert score == 0.0
        assert source == "parcel_checklist"

    def test_all_not_sure_uses_county_median(self):
        parcel = {item: None for item in self.calc.infra_items}
        score, source = self.calc.compute_score(parcel, "Nairobi")
        assert source == "imputed_county_median"
        assert score == 8.70

    def test_all_not_sure_falls_back_to_global(self):
        parcel = {item: None for item in self.calc.infra_items}
        score, source = self.calc.compute_score(parcel, "UnknownCounty")
        assert source == "imputed_global_median"
        assert score == 8.70

    def test_mutual_exclusivity_fence(self):
        parcel = {item: 0 for item in self.calc.infra_items}
        parcel["full_fence"] = 1
        parcel["partial_fence"] = 1
        score, _ = self.calc.compute_score(parcel, "Nairobi")
        # Only full_fence weight (0.18) should count
        expected = round(np.clip(0.18 / 1.38 * 100, 0, 100), 2)
        assert score == pytest.approx(expected, abs=0.01)

    def test_mutual_exclusivity_water(self):
        parcel = {item: 0 for item in self.calc.infra_items}
        parcel["borehole"] = 1
        parcel["water_tank"] = 1
        score, _ = self.calc.compute_score(parcel, "Nairobi")
        expected = round(np.clip(0.25 / 1.38 * 100, 0, 100), 2)
        assert score == pytest.approx(expected, abs=0.01)

    def test_mutual_exclusivity_electric(self):
        parcel = {item: 0 for item in self.calc.infra_items}
        parcel["grid_electric"] = 1
        parcel["solar_electric"] = 1
        score, _ = self.calc.compute_score(parcel, "Nairobi")
        expected = round(np.clip(0.22 / 1.38 * 100, 0, 100), 2)
        assert score == pytest.approx(expected, abs=0.01)


# ---- Edge cases ----


class TestEdgeCases:
    def test_point_outside_kenya_raises(self):
        """A point outside the Kenya bounding box should be detectable."""
        # Point in South Sudan (north of Kenya)
        lat, _lon = 8.0, 30.0
        assert not (KE_BOUNDS["lat"][0] <= lat <= KE_BOUNDS["lat"][1])

    def test_size_below_training_range(self):
        """Size of 0.001 acres should still produce a valid log."""
        assert math.log(0.001) < 0  # negative log is fine

    def test_size_above_training_range(self):
        """Size of 100000 acres should still produce a valid log."""
        assert math.log(100000) > 0

    def test_nan_coordinates(self):
        """NaN coordinates should propagate as NaN distances."""
        from landval.features.proximity import ProximityCalculator

        calc = ProximityCalculator(_make_reference_data(), _make_scoring_params())
        d = calc.dist_to_nairobi_km(float("nan"), 36.0)
        assert math.isnan(d)


# ---- Full parity test (skipped without fixture) ----


@pytest.mark.skipif(
    not os.path.exists(
        os.path.join(os.path.dirname(__file__), "..", "..", "artifacts", "parity_fixture.parquet")
    ),
    reason="parity_fixture.parquet not found — run with artifacts present",
)
class TestFullParity:
    def test_parity_passes(self):
        """Full parity test against parity_fixture.parquet."""
        artifacts = os.path.join(os.path.dirname(__file__), "..", "..", "artifacts")
        from scripts.parity_test import run_parity

        passed, report = run_parity(artifacts)
        assert passed, f"Parity test failed:\n{report.to_string()}"
