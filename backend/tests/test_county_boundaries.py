"""Tests for the county boundaries + per-listing scatter endpoints.

Three layers:
  1. CountyBoundariesIndex unit tests — verify the GeoJSON loads, county
     names are extracted, and the raw string is cached.
  2. Endpoint integration tests — verify GET /api/v1/counties/boundaries
     returns the GeoJSON, GET /api/v1/counties/{county}/listings paginates
     + recomputes dist_to_nairobi_km, and GET /api/v1/counties/row_counts
     reports per-county listing counts.
  3. Degraded-mode tests — 503 DATA_UNAVAILABLE when the backing files
     are absent.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import pytest

# Ensure backend/ and src/ are importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))


# ----------------------------------------------------------------------
# GeoJSON fixture — 3 tiny county polygons
# ----------------------------------------------------------------------


def _write_tiny_counties_geojson(tmp_path: Path) -> str:
    """Write a 3-county GeoJSON (Nairobi, Kiambu, Nakuru) for testing."""
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"county": "Nairobi", "GID_1": "KEN.1_1"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [36.7, -1.1],
                            [37.0, -1.1],
                            [37.0, -1.4],
                            [36.7, -1.4],
                            [36.7, -1.1],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"county": "Kiambu", "GID_1": "KEN.2_1"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [36.6, -0.9],
                            [36.9, -0.9],
                            [36.9, -1.2],
                            [36.6, -1.2],
                            [36.6, -0.9],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"county": "Nakuru", "GID_1": "KEN.3_1"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [35.8, -0.1],
                            [36.4, -0.1],
                            [36.4, -0.6],
                            [35.8, -0.6],
                            [35.8, -0.1],
                        ]
                    ],
                },
            },
        ],
    }
    path = str(tmp_path / "kenya_counties_simplified.geojson")
    with open(path, "w") as f:
        json.dump(geojson, f)
    return path


def _tiny_listings_scored_df() -> pd.DataFrame:
    """5 listings across 3 counties, with lat/lon for dist_to_nairobi recomputation."""
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
                "title": "Westlands 0.5 acre",
                "location": "Westlands",
                "county": "Nairobi",
                "prop_type": "Land",
                "latitude": -1.26,
                "longitude": 36.78,
                "price_ksh": 8_000_000.0,
                "size_acres": 0.5,
                "listed_price_per_acre_ksh": 16_000_000.0,
                "predicted_price_per_acre_ksh": 12_000_000.0,
                "low_price_per_acre_ksh": 8_000_000.0,
                "high_price_per_acre_ksh": 18_000_000.0,
                "listed_over_predicted": 1.33,
                "scored_by": "test",
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L003",
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
                "scored_by": "oof",
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L004",
                "title": "Nakuru 2 acres",
                "location": "Nakuru",
                "county": "Nakuru",
                "prop_type": "Farm",
                "latitude": -0.30,
                "longitude": 36.07,
                "price_ksh": 6_000_000.0,
                "size_acres": 2.0,
                "listed_price_per_acre_ksh": 3_000_000.0,
                "predicted_price_per_acre_ksh": 2_800_000.0,
                "low_price_per_acre_ksh": 1_880_000.0,
                "high_price_per_acre_ksh": 4_170_000.0,
                "listed_over_predicted": 1.07,
                "scored_by": "oof",
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L005",
                "title": "Nakuru 0.5 acre",
                "location": "Nakuru",
                "county": "Nakuru",
                "prop_type": "Farm",
                "latitude": -0.28,
                "longitude": 36.10,
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


# ----------------------------------------------------------------------
# CountyBoundariesIndex unit tests
# ----------------------------------------------------------------------


class TestCountyBoundariesIndex:
    def test_load_and_county_names(self, tmp_path):
        from app.services.county_boundaries import CountyBoundariesIndex

        path = _write_tiny_counties_geojson(tmp_path)
        idx = CountyBoundariesIndex(geojson_path=path).load()
        assert idx.loaded is True
        assert idx.n_counties == 3
        assert set(idx.county_names) == {"Nairobi", "Kiambu", "Nakuru"}

    def test_get_geojson_str_returns_cached_string(self, tmp_path):
        from app.services.county_boundaries import CountyBoundariesIndex

        path = _write_tiny_counties_geojson(tmp_path)
        idx = CountyBoundariesIndex(geojson_path=path).load()
        s = idx.get_geojson_str()
        assert s is not None
        assert '"type": "FeatureCollection"' in s
        # The dict form parses correctly
        d = idx.get_geojson_dict()
        assert d is not None
        assert d["type"] == "FeatureCollection"
        assert len(d["features"]) == 3

    def test_load_returns_false_when_file_missing(self, tmp_path):
        from app.services.county_boundaries import CountyBoundariesIndex

        idx = CountyBoundariesIndex(geojson_path=str(tmp_path / "nonexistent.geojson")).load()
        assert idx.loaded is False
        assert idx.get_geojson_str() is None
        assert idx.get_geojson_dict() is None


# ----------------------------------------------------------------------
# Endpoint integration tests
# ----------------------------------------------------------------------


class TestCountyBoundariesEndpoint:
    def test_returns_geojson(self, app, tmp_path, client):
        """GET /api/v1/counties/boundaries returns the simplified GeoJSON."""
        path = _write_tiny_counties_geojson(tmp_path)
        from app.services.county_boundaries import CountyBoundariesIndex

        app.state.county_boundaries_index = CountyBoundariesIndex(geojson_path=path).load()
        resp = client.get("/api/v1/counties/boundaries")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["type"] == "FeatureCollection"
        assert len(body["features"]) == 3
        # County names in the properties
        counties = {f["properties"]["county"] for f in body["features"]}
        assert counties == {"Nairobi", "Kiambu", "Nakuru"}
        # Content-Type is GeoJSON
        assert "geo+json" in resp.headers.get("content-type", "")

    def test_503_when_index_absent(self, client):
        """When the boundaries index isn't loaded, returns 503 DATA_UNAVAILABLE."""
        # The conftest's app fixture sets county_boundaries_index with a
        # non-existent path, so it loads=False.
        resp = client.get("/api/v1/counties/boundaries")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"


class TestCountyListingsEndpoint:
    def test_happy_path_nairobi(self, app, tmp_path, client):
        """GET /api/v1/counties/Nairobi/listings returns the 2 Nairobi listings
        with recomputed dist_to_nairobi_km, sorted by distance ascending."""
        # Write a tiny listings_scored.parquet
        app_exports_dir = tmp_path / "app_exports"
        app_exports_dir.mkdir(parents=True, exist_ok=True)
        _tiny_listings_scored_df().to_parquet(
            app_exports_dir / "listings_scored.parquet", index=False
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()

        resp = client.get("/api/v1/counties/Nairobi/listings")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["county"] == "Nairobi"
        assert body["pagination"]["total_rows"] == 2
        # Sorted by dist_to_nairobi_km ascending — L002 (Westlands, ~7 km from CBD)
        # is closer than L001 (Karen, ~10 km)
        assert body["listings"][0]["listing_no"] == "L002"
        assert body["listings"][1]["listing_no"] == "L001"
        # dist_to_nairobi_km is recomputed and finite
        assert body["listings"][0]["dist_to_nairobi_km"] is not None
        assert body["listings"][0]["dist_to_nairobi_km"] < body["listings"][1]["dist_to_nairobi_km"]
        # Each row has the scatter fields
        r = body["listings"][0]
        assert "listed_price_per_acre_ksh" in r
        assert "dist_to_nairobi_km" in r
        assert "size_acres" in r
        assert "verdict" in r

    def test_pagination(self, app, tmp_path, client):
        """3 Nakuru listings — page_size=2 returns 2 rows on page 1, 1 on page 2."""
        app_exports_dir = tmp_path / "app_exports"
        app_exports_dir.mkdir(parents=True, exist_ok=True)
        _tiny_listings_scored_df().to_parquet(
            app_exports_dir / "listings_scored.parquet", index=False
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()

        resp = client.get("/api/v1/counties/Nakuru/listings?page_size=2&page=1")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pagination"]["total_rows"] == 2  # 2 Nakuru listings
        assert body["pagination"]["page_size"] == 2
        assert body["pagination"]["total_pages"] == 1
        assert len(body["listings"]) == 2

    def test_empty_county_returns_empty_page(self, app, tmp_path, client):
        """A county with no listings returns an empty page (not an error)."""
        app_exports_dir = tmp_path / "app_exports"
        app_exports_dir.mkdir(parents=True, exist_ok=True)
        _tiny_listings_scored_df().to_parquet(
            app_exports_dir / "listings_scored.parquet", index=False
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()

        resp = client.get("/api/v1/counties/Mombasa/listings")
        assert resp.status_code == 200
        body = resp.json()
        assert body["county"] == "Mombasa"
        assert body["pagination"]["total_rows"] == 0
        assert body["listings"] == []

    def test_503_when_listings_absent(self, client):
        """When listings_scored.parquet is missing, returns 503 DATA_UNAVAILABLE."""
        resp = client.get("/api/v1/counties/Nairobi/listings")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"

    def test_dist_to_nairobi_uses_b1_haversine(self, app, tmp_path, client):
        """The recomputed dist_to_nairobi_km matches B1's haversine_km for a
        known point (Nairobi CBD itself → 0 km)."""

        from landval.features.geo import haversine_km

        app_exports_dir = tmp_path / "app_exports"
        app_exports_dir.mkdir(parents=True, exist_ok=True)
        # One listing exactly at Nairobi CBD
        df = pd.DataFrame(
            [
                {
                    "listing_no": "L999",
                    "title": "CBD",
                    "location": "Nairobi",
                    "county": "Nairobi",
                    "prop_type": "Land",
                    "latitude": -1.2921,
                    "longitude": 36.8219,
                    "price_ksh": 10_000_000.0,
                    "size_acres": 1.0,
                    "listed_price_per_acre_ksh": 10_000_000.0,
                    "predicted_price_per_acre_ksh": 9_000_000.0,
                    "low_price_per_acre_ksh": 6_000_000.0,
                    "high_price_per_acre_ksh": 13_500_000.0,
                    "listed_over_predicted": 1.11,
                    "scored_by": "oof",
                    "verdict": "fair",
                    "data_quality_flag": False,
                }
            ]
        )
        df.to_parquet(app_exports_dir / "listings_scored.parquet", index=False)
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()

        resp = client.get("/api/v1/counties/Nairobi/listings")
        body = resp.json()
        dist = body["listings"][0]["dist_to_nairobi_km"]
        # Should be ~0 (Nairobi CBD to itself)
        assert dist is not None
        assert dist == pytest.approx(0.0, abs=0.5)
        # Cross-check against B1's scalar haversine
        expected = haversine_km(-1.2921, 36.8219, -1.2921, 36.8219)
        assert dist == pytest.approx(expected, abs=0.01)


class TestCountyRowCountsEndpoint:
    def test_happy_path(self, app, tmp_path, client):
        """GET /api/v1/counties/row_counts reports per-county listing counts."""
        app_exports_dir = tmp_path / "app_exports"
        app_exports_dir.mkdir(parents=True, exist_ok=True)
        _tiny_listings_scored_df().to_parquet(
            app_exports_dir / "listings_scored.parquet", index=False
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()

        resp = client.get("/api/v1/counties/row_counts")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total_listings"] == 5
        counts = {r["county"]: r["n_listings"] for r in body["counties"]}
        assert counts["Nairobi"] == 2
        assert counts["Kiambu"] == 1
        assert counts["Nakuru"] == 2

    def test_503_when_listings_absent(self, client):
        resp = client.get("/api/v1/counties/row_counts")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"
