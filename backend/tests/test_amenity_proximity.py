"""Tests for the amenity-proximity filter (Deal Finder near_amenity / radius_km).

Three layers:
  1. B1 calculator unit tests — verify the new public batch accessors return
     the same distances as the existing single-point query, and that NaN
     coordinates / unknown amenity keys are handled cleanly.
  2. AmenityProximityService unit tests — stub the FeaturePipeline and verify
     the caching behaviour, the user-facing-name-to-B1-key mapping, and the
     503 / 422 error paths.
  3. Endpoint integration tests — verify the new near_amenity / radius_km
     query parameters filter correctly, that 503 is returned when the
     service is absent, and that 422 is returned when one parameter is
     supplied without the other.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Ensure backend/ and src/ are importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))


# ----------------------------------------------------------------------
# B1 calculator tests — the new public accessors
# ----------------------------------------------------------------------


def _tiny_pois_gdf():
    """A tiny POI GeoDataFrame with one hospital and one school."""
    import geopandas as gpd
    from shapely.geometry import Point

    return gpd.GeoDataFrame(
        {
            "amenity": ["hospital", "school"],
            "shop": [None, None],
            "highway": [None, None],
        },
        geometry=[Point(36.82, -1.29), Point(36.90, -1.30)],  # (lon, lat)
        crs="EPSG:4326",
    )


def _tiny_roads_gdf():
    """A tiny roads GeoDataFrame with one primary road segment."""
    import geopandas as gpd
    from shapely.geometry import LineString

    return gpd.GeoDataFrame(
        {"highway": ["primary"]},
        geometry=[LineString([(36.80, -1.29), (36.85, -1.30)])],
        crs="EPSG:4326",
    )


def _scoring_params_with_school_hospital():
    """scoring_params.json with hospital + school amenity filters + a primary road."""
    return {
        "amenity_params": {
            "hospital": [0.25, 0.30],
            "school": [0.20, 0.25],
        },
        "amenity_filters": {
            "hospital": {"amenity": ["hospital"]},
            "school": {"amenity": ["school", "college"]},
        },
        "road_weights": {"primary": 0.75},
        "road_beta": 0.5,
        "town_beta": 0.08,
        "nairobi_beta": 0.04,
        "score_weights": {"road": 0.50, "town": 0.30, "nairobi": 0.20},
    }


class TestAmenitiesCalculatorAccessors:
    def test_nearest_amenity_distance_km_matches_single_point_query(self, tmp_path):
        """The new public single-point accessor returns the same distance as
        the existing private _nearest_distance_km."""

        from landval.features.amenities import AmenitiesCalculator

        pois_path = tmp_path / "pois.gpkg"
        _tiny_pois_gdf().to_file(pois_path, driver="GPKG")

        calc = AmenitiesCalculator(_scoring_params_with_school_hospital(), str(pois_path))
        # Force load
        calc._ensure_loaded()

        # Point at (-1.29, 36.82) — exactly on the hospital
        d = calc.nearest_amenity_distance_km(-1.29, 36.82, "hospital")
        assert d == pytest.approx(0.0, abs=0.01)

        # Same result via the private method
        d_private = calc._nearest_distance_km(-1.29, 36.82, calc._trees["hospital"])
        assert d == pytest.approx(d_private, abs=1e-9)

    def test_batch_matches_single_point_for_each_row(self, tmp_path):
        """The batch accessor returns the same distances as N single-point calls."""
        from landval.features.amenities import AmenitiesCalculator

        pois_path = tmp_path / "pois.gpkg"
        _tiny_pois_gdf().to_file(pois_path, driver="GPKG")

        calc = AmenitiesCalculator(_scoring_params_with_school_hospital(), str(pois_path))
        lats = np.array([-1.29, -1.30, -1.0, float("nan")])
        lons = np.array([36.82, 36.90, 36.0, 36.0])

        batch = calc.nearest_amenity_distances_km(lats, lons, "hospital")
        # Compare against per-point calls
        single = np.array(
            [
                calc.nearest_amenity_distance_km(float(la), float(lo), "hospital")
                for la, lo in zip(lats, lons, strict=False)
            ]
        )
        # NaN positions are NaN in both; finite positions match
        finite = np.isfinite(batch)
        np.testing.assert_allclose(batch[finite], single[finite], atol=1e-9)
        # NaN coordinate -> NaN distance
        assert np.isnan(batch[-1])
        assert np.isnan(single[-1])

    def test_unknown_amenity_raises_key_error(self, tmp_path):
        from landval.features.amenities import AmenitiesCalculator

        pois_path = tmp_path / "pois.gpkg"
        _tiny_pois_gdf().to_file(pois_path, driver="GPKG")
        calc = AmenitiesCalculator(_scoring_params_with_school_hospital(), str(pois_path))
        with pytest.raises(KeyError, match="market"):
            calc.nearest_amenity_distance_km(-1.29, 36.82, "market")


class TestAccessibilityCalculatorAccessors:
    def test_nearest_road_distance_km_min_over_classes(self, tmp_path):
        """When multiple road classes are passed, returns the min distance."""
        from landval.features.accessibility import AccessibilityCalculator

        roads_path = tmp_path / "roads.gpkg"
        _tiny_roads_gdf().to_file(roads_path, driver="GPKG")

        # scoring_params with primary + trunk, but the GPKG only has primary
        params = _scoring_params_with_school_hospital()
        params["road_weights"] = {"primary": 0.75, "trunk": 0.50}

        calc = AccessibilityCalculator(params, str(roads_path))
        # Point near the primary road segment (LineString from (36.80, -1.29)
        # to (36.85, -1.30)).  Query at (lat=-1.29, lon=36.82) is ~2 km from
        # the nearest road vertex — verify the distance is finite and roughly
        # in that ballpark (the exact value depends on haversine vs. the
        # road's actual geometry).
        d = calc.nearest_road_distance_km(-1.29, 36.82, ["primary", "trunk"])
        assert np.isfinite(d)
        assert d < 5.0  # within 5 km of the road segment

    def test_batch_returns_min_over_classes(self, tmp_path):
        from landval.features.accessibility import AccessibilityCalculator

        roads_path = tmp_path / "roads.gpkg"
        _tiny_roads_gdf().to_file(roads_path, driver="GPKG")
        params = _scoring_params_with_school_hospital()
        calc = AccessibilityCalculator(params, str(roads_path))

        lats = np.array([-1.29, -1.30, -1.0, float("nan")])
        lons = np.array([36.82, 36.90, 36.0, 36.0])
        batch = calc.nearest_road_distances_km(lats, lons, ["primary", "trunk"])
        assert len(batch) == 4
        # NaN coordinate -> NaN
        assert np.isnan(batch[-1])
        # Finite distances
        assert np.isfinite(batch[:-1]).all()

    def test_unknown_road_class_silently_skipped(self, tmp_path):
        from landval.features.accessibility import AccessibilityCalculator

        roads_path = tmp_path / "roads.gpkg"
        _tiny_roads_gdf().to_file(roads_path, driver="GPKG")
        params = _scoring_params_with_school_hospital()
        calc = AccessibilityCalculator(params, str(roads_path))
        # motorway isn't configured but primary is — should still return a
        # distance from the primary tree
        d = calc.nearest_road_distance_km(-1.29, 36.82, ["motorway", "primary"])
        assert np.isfinite(d)

    def test_no_configured_classes_returns_nan(self, tmp_path):
        from landval.features.accessibility import AccessibilityCalculator

        roads_path = tmp_path / "roads.gpkg"
        _tiny_roads_gdf().to_file(roads_path, driver="GPKG")
        params = _scoring_params_with_school_hospital()
        calc = AccessibilityCalculator(params, str(roads_path))
        d = calc.nearest_road_distance_km(-1.29, 36.82, ["motorway", "trunk"])
        assert np.isnan(d)


# ----------------------------------------------------------------------
# Stub FeaturePipeline (for AmenityProximityService unit tests)
# ----------------------------------------------------------------------


class _StubFeaturePipeline:
    """Stub that returns canned distances per amenity / road type."""

    def __init__(self, amenity_distances: dict[str, np.ndarray], road_distances: np.ndarray):
        self._amenity_distances = amenity_distances  # {amenity: array}
        self._road_distances = road_distances

    def amenity_distances_km(self, lats, lons, amenity):
        if amenity not in self._amenity_distances:
            raise KeyError(
                f"amenity {amenity!r} is not configured in scoring_params['amenity_filters']"
            )
        return self._amenity_distances[amenity]

    def road_distances_km(self, lats, lons, road_classes):
        return self._road_distances

    def configured_amenities(self):
        return sorted(self._amenity_distances.keys())

    def configured_road_classes(self):
        return ["primary"]  # stub


# ----------------------------------------------------------------------
# AmenityProximityService unit tests
# ----------------------------------------------------------------------


def _tiny_listings_df():
    """5 listings, some near a hospital, some far."""
    return pd.DataFrame(
        {
            "listing_no": ["L001", "L002", "L003", "L004", "L005"],
            "latitude": [-1.29, -1.30, -1.0, -2.0, float("nan")],
            "longitude": [36.82, 36.90, 36.0, 37.0, 36.0],
        }
    )


class TestAmenityProximityService:
    def test_filter_by_amenity_returns_within_radius_rows(self):
        from app.services.amenity_proximity import AmenityProximityService

        df = _tiny_listings_df()
        # Hospital distances: [0.5, 2.0, 10.0, 50.0, NaN]
        stub = _StubFeaturePipeline(
            amenity_distances={"hospital": np.array([0.5, 2.0, 10.0, 50.0, float("nan")])},
            road_distances=np.array([]),
        )
        svc = AmenityProximityService(feature_pipeline=stub, listings_scored_df=df)

        filtered = svc.filter_by_amenity(df, "hospital", radius_km=3)
        # Only L001 (0.5 km) and L002 (2.0 km) are within 3 km
        assert list(filtered["listing_no"]) == ["L001", "L002"]

    def test_filter_caches_distances(self):
        """The second call for the same amenity type reuses the cached array
        — verified by mutating the stub's distances after the first call and
        confirming the second call still returns the original values."""
        from app.services.amenity_proximity import AmenityProximityService

        df = _tiny_listings_df()
        distances = np.array([0.5, 2.0, 10.0, 50.0, float("nan")])
        stub = _StubFeaturePipeline(
            amenity_distances={"hospital": distances},
            road_distances=np.array([]),
        )
        svc = AmenityProximityService(feature_pipeline=stub, listings_scored_df=df)

        # First call computes + caches
        svc.filter_by_amenity(df, "hospital", radius_km=3)
        # Mutate the stub's array — the cache should NOT pick this up
        stub._amenity_distances["hospital"] = np.array([100.0, 100.0, 100.0, 100.0, float("nan")])
        # Second call should still use the cached distances
        filtered = svc.filter_by_amenity(df, "hospital", radius_km=3)
        assert list(filtered["listing_no"]) == ["L001", "L002"]
        # Cache key present
        assert "hospital" in svc._distance_cache

    def test_tarmac_road_uses_road_distances(self):
        from app.services.amenity_proximity import AmenityProximityService

        df = _tiny_listings_df()
        road_dists = np.array([0.4, 5.0, 20.0, 80.0, float("nan")])
        stub = _StubFeaturePipeline(
            amenity_distances={},
            road_distances=road_dists,
        )
        svc = AmenityProximityService(feature_pipeline=stub, listings_scored_df=df)
        filtered = svc.filter_by_amenity(df, "tarmac_road", radius_km=1)
        assert list(filtered["listing_no"]) == ["L001"]
        # Sanity check: the service passed TARMAC_ROAD_CLASSES to the stub
        # (we can't directly verify the call args since the stub doesn't record
        # them, but the docstring + the test name document the mapping).

    def test_503_when_feature_pipeline_is_none(self):
        from app.core.exceptions import AppError
        from app.services.amenity_proximity import AmenityProximityService

        df = _tiny_listings_df()
        svc = AmenityProximityService(feature_pipeline=None, listings_scored_df=df)
        with pytest.raises(AppError) as exc_info:
            svc.filter_by_amenity(df, "hospital", radius_km=3)
        assert exc_info.value.code == "AMENITY_FILTER_UNAVAILABLE"
        assert exc_info.value.status_code == 503

    def test_503_when_amenity_not_configured(self):
        """When the user passes 'school' but scoring_params only has 'hospital',
        the service returns 503 AMENITY_FILTER_UNAVAILABLE (not 422 — the
        request was well-formed, the backend just can't satisfy it)."""
        from app.core.exceptions import AppError
        from app.services.amenity_proximity import AmenityProximityService

        df = _tiny_listings_df()
        stub = _StubFeaturePipeline(
            amenity_distances={"hospital": np.array([0.5, 2.0, 10.0, 50.0, float("nan")])},
            road_distances=np.array([]),
        )
        svc = AmenityProximityService(feature_pipeline=stub, listings_scored_df=df)
        with pytest.raises(AppError) as exc_info:
            svc.filter_by_amenity(df, "school", radius_km=3)
        assert exc_info.value.code == "AMENITY_FILTER_UNAVAILABLE"

    def test_422_when_amenity_not_in_supported_enum(self):
        from app.core.exceptions import AppError
        from app.services.amenity_proximity import AmenityProximityService

        df = _tiny_listings_df()
        stub = _StubFeaturePipeline(
            amenity_distances={"hospital": np.array([0.5])}, road_distances=np.array([])
        )
        svc = AmenityProximityService(feature_pipeline=stub, listings_scored_df=df)
        with pytest.raises(AppError) as exc_info:
            svc.filter_by_amenity(df, "market", radius_km=3)
        assert exc_info.value.code == "VALIDATION_ERROR"
        assert exc_info.value.status_code == 422

    def test_available_amenities_reports_configured_state(self):
        from app.services.amenity_proximity import AmenityProximityService

        df = _tiny_listings_df()
        stub = _StubFeaturePipeline(
            amenity_distances={"hospital": np.array([0.5]), "school": np.array([0.5])},
            road_distances=np.array([0.5]),
        )
        svc = AmenityProximityService(feature_pipeline=stub, listings_scored_df=df)
        avail = svc.available_amenities()
        assert avail["hospital"] is True
        assert avail["school"] is True
        assert avail["tarmac_road"] is True  # primary is configured in the stub

    def test_available_amenities_all_false_when_no_pipeline(self):
        from app.services.amenity_proximity import AmenityProximityService

        svc = AmenityProximityService(feature_pipeline=None, listings_scored_df=None)
        avail = svc.available_amenities()
        assert avail == {"hospital": False, "school": False, "tarmac_road": False}


# ----------------------------------------------------------------------
# Endpoint integration tests
# ----------------------------------------------------------------------


def _tiny_listings_scored_df() -> pd.DataFrame:
    """Cell 9.6 columns + a few rows for the endpoint test."""
    return pd.DataFrame(
        [
            {
                "listing_no": "L001",
                "title": "Karen 1 acre",
                "location": "Karen",
                "county": "Nairobi",
                "prop_type": "Land",
                "latitude": -1.32,
                "longitude": 36.73,
                "price_ksh": 4_500_000.0,
                "size_acres": 1.0,
                "listed_price_per_acre_ksh": 4_500_000.0,
                "predicted_price_per_acre_ksh": 5_000_000.0,
                "low_price_per_acre_ksh": 3_350_000.0,
                "high_price_per_acre_ksh": 7_460_000.0,
                "listed_over_predicted": 0.90,
                "scored_by": "oof",
                "verdict": "underpriced",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L002",
                "title": "Kiambu 5 acres",
                "location": "Kiambu",
                "county": "Kiambu",
                "prop_type": "Land",
                "latitude": -1.03,
                "longitude": 36.83,
                "price_ksh": 14_000_000.0,
                "size_acres": 5.0,
                "listed_price_per_acre_ksh": 2_800_000.0,
                "predicted_price_per_acre_ksh": 2_500_000.0,
                "low_price_per_acre_ksh": 1_675_000.0,
                "high_price_per_acre_ksh": 3_730_000.0,
                "listed_over_predicted": 1.12,
                "scored_by": "test",
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L003",
                "title": "Nakuru 0.5 acre",
                "location": "Nakuru",
                "county": "Nakuru",
                "prop_type": "Farm",
                "latitude": -0.30,
                "longitude": 36.07,
                "price_ksh": 8_000_000.0,
                "size_acres": 0.5,
                "listed_price_per_acre_ksh": 16_000_000.0,
                "predicted_price_per_acre_ksh": 6_500_000.0,
                "low_price_per_acre_ksh": 4_355_000.0,
                "high_price_per_acre_ksh": 9_700_000.0,
                "listed_over_predicted": 2.46,
                "scored_by": "oof",
                "verdict": "overpriced",
                "data_quality_flag": True,
            },
        ]
    )


class TestListingsScoredNearAmenityEndpoint:
    def test_near_amenity_filter_applied(self, app, tmp_path, client):
        """?near_amenity=hospital&radius_km=1 returns only listings within 1 km
        of a hospital, with the filter echoed in pagination.filters."""
        # Write a tiny listings_scored.parquet into app_exports/
        app_exports_dir = tmp_path / "app_exports"
        app_exports_dir.mkdir(parents=True, exist_ok=True)
        _tiny_listings_scored_df().to_parquet(
            app_exports_dir / "listings_scored.parquet", index=False
        )
        # Reload the AppExportsRegistry so it picks up the file
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()

        # Inject a stub amenity_proximity_service that returns canned distances
        from app.services.amenity_proximity import AmenityProximityService

        df = _tiny_listings_scored_df()
        stub = _StubFeaturePipeline(
            amenity_distances={
                "hospital": np.array([0.5, 4.0, 20.0]),  # only L001 within 1 km
            },
            road_distances=np.array([]),
        )
        app.state.amenity_proximity_service = AmenityProximityService(
            feature_pipeline=stub, listings_scored_df=df
        )

        resp = client.get("/api/v1/listings/scored?near_amenity=hospital&radius_km=1")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["pagination"]["total_rows"] == 1
        assert body["listings"][0]["listing_no"] == "L001"
        # Filter echoed
        assert body["pagination"]["filters"]["near_amenity"] == "hospital"
        assert body["pagination"]["filters"]["radius_km"] == 1

    def test_near_amenity_with_verdict_combined(self, app, tmp_path, client):
        """The amenity filter composes with the verdict filter."""
        app_exports_dir = tmp_path / "app_exports"
        app_exports_dir.mkdir(parents=True, exist_ok=True)
        _tiny_listings_scored_df().to_parquet(
            app_exports_dir / "listings_scored.parquet", index=False
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()

        from app.services.amenity_proximity import AmenityProximityService

        df = _tiny_listings_scored_df()
        # L001 (underpriced) and L002 (fair) within 5 km; L003 far
        stub = _StubFeaturePipeline(
            amenity_distances={"hospital": np.array([0.5, 3.0, 50.0])},
            road_distances=np.array([]),
        )
        app.state.amenity_proximity_service = AmenityProximityService(
            feature_pipeline=stub, listings_scored_df=df
        )

        resp = client.get("/api/v1/listings/scored?near_amenity=hospital&radius_km=5&verdict=fair")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Only L002 (within 5km AND verdict=fair)
        assert body["pagination"]["total_rows"] == 1
        assert body["listings"][0]["listing_no"] == "L002"
        assert body["pagination"]["filters"]["verdict"] == "fair"

    def test_503_when_amenity_service_absent(self, app, tmp_path, client):
        """When the amenity_proximity_service is None (degraded mode), the
        endpoint returns 503 AMENITY_FILTER_UNAVAILABLE, NOT the listings."""
        app_exports_dir = tmp_path / "app_exports"
        app_exports_dir.mkdir(parents=True, exist_ok=True)
        _tiny_listings_scored_df().to_parquet(
            app_exports_dir / "listings_scored.parquet", index=False
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        app.state.amenity_proximity_service = None  # explicitly absent

        resp = client.get("/api/v1/listings/scored?near_amenity=hospital&radius_km=1")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "AMENITY_FILTER_UNAVAILABLE"

    def test_422_when_near_amenity_without_radius_km(self, client):
        """Supplying near_amenity without radius_km (or vice versa) is a
        usage error — the filter needs both."""
        # No listings file needed — the validation fires before the data load
        resp = client.get("/api/v1/listings/scored?near_amenity=hospital")
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert "together" in body["error"]["message"].lower()

    def test_422_when_radius_km_without_near_amenity(self, client):
        resp = client.get("/api/v1/listings/scored?radius_km=1")
        assert resp.status_code == 422

    def test_422_when_near_amenity_not_in_enum(self, client):
        """Pydantic Literal validation rejects values outside the enum."""
        resp = client.get("/api/v1/listings/scored?near_amenity=market&radius_km=1")
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_422_when_radius_km_not_in_enum(self, client):
        """radius_km must be one of 1, 3, 5."""
        resp = client.get("/api/v1/listings/scored?near_amenity=hospital&radius_km=2")
        assert resp.status_code == 422

    def test_no_amenity_filter_still_works(self, app, tmp_path, client):
        """When neither near_amenity nor radius_km is supplied, the endpoint
        behaves as before — no amenity service lookup."""
        app_exports_dir = tmp_path / "app_exports"
        app_exports_dir.mkdir(parents=True, exist_ok=True)
        _tiny_listings_scored_df().to_parquet(
            app_exports_dir / "listings_scored.parquet", index=False
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        # amenity_proximity_service stays None — but no amenity filter requested
        resp = client.get("/api/v1/listings/scored")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pagination"]["total_rows"] == 3  # all listings
        assert "near_amenity" not in body["pagination"]["filters"]
