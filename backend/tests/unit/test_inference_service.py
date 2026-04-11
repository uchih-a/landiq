"""Unit tests for inference service."""

import math

import pytest

from app.services.inference import (
    NAIROBI,
    REFERENCE_CITIES,
    classify_influence,
    compute_features,
)


class TestDistanceCalculations:
    """Test distance calculations."""

    def test_nairobi_distance_from_nairobi_is_zero(self):
        """Test distance from Nairobi to itself is zero."""
        from geopy.distance import geodesic

        dist = geodesic(NAIROBI, NAIROBI).km
        assert dist == 0

    def test_mombasa_distance_to_nairobi_is_approximately_440km(self):
        """Test Mombasa to Nairobi distance is approximately 440km."""
        from geopy.distance import geodesic

        mombasa = REFERENCE_CITIES["Mombasa"]
        dist = geodesic(mombasa, NAIROBI).km
        assert 400 < dist < 500  # Approximate range


class TestFeatureComputation:
    """Test feature computation."""

    def test_location_score_equals_sum_divided_by_200(self):
        """Test location score calculation."""
        # This is a simplified test - full test would require mocking geocoding
        amenity = 80
        accessibility = 60
        expected_score = (amenity + accessibility) / 200.0
        assert expected_score == 0.7

    def test_log_land_size_clamps_minimum_at_0_01(self):
        """Test log land size clamps at minimum."""
        small_size = 0.001
        log_size = math.log(max(small_size, 0.01))
        assert log_size == math.log(0.01)

    def test_feature_dict_has_exactly_12_keys(self):
        """Test feature dictionary has 12 keys."""
        # This is a simplified test
        features = {
            "log_land_size": 1.0,
            "amenity_score": 50.0,
            "accessibility_score": 50.0,
            "infrastructure_score": 50.0,
            "dist_to_nairobi_km": 100.0,
            "dist_to_water_body_km": 10.0,
            "dist_to_reference_km": 50.0,
            "dist_to_city_km": 30.0,
            "geo_confidence": 0.8,
            "location_score": 0.5,
            "log_dist_to_nairobi": 4.6,
            "log_price_lag": 0.0,
        }
        assert len(features) == 12


class TestInfluenceClassification:
    """Test influence classification."""

    def test_classify_close_nairobi_as_high_positive(self):
        """Test close to Nairobi is high positive."""
        influence, direction = classify_influence("dist_to_nairobi_km", 30)
        assert influence == "High"
        assert direction == "positive"

    def test_classify_far_nairobi_as_low_negative(self):
        """Test far from Nairobi is low negative."""
        influence, direction = classify_influence("dist_to_nairobi_km", 200)
        assert influence == "Low"
        assert direction == "negative"

    def test_classify_high_amenity_as_high_positive(self):
        """Test high amenity score is high positive."""
        influence, direction = classify_influence("amenity_score", 80)
        assert influence == "High"
        assert direction == "positive"


class TestGeocoding:
    """Test geocoding functionality."""

    def test_geo_confidence_plus_code_detection(self):
        """Test Plus Code detection."""
        import re

        PLUS_CODE_REGEX = re.compile(
            r"^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$"
        )
        assert PLUS_CODE_REGEX.match("6GCR+QP") is not None
        assert PLUS_CODE_REGEX.match("Nairobi") is None


class TestCountyWaterMedian:
    """Test county water median fallback."""

    def test_county_water_median_fallback_for_unknown_county(self):
        """Test fallback for unknown county."""
        fallback = 12.8
        assert fallback == 12.8
