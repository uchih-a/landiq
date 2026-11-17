"""Tests for the places endpoints + named-POI integration in the predict response.

Two layers:
  1. PlacesIndex / NamedPOIIndex unit tests — verify the search ranking,
     nearest-town lookup, and nearby-POI radius filter against tiny
     in-memory GPKG fixtures.
  2. Endpoint integration tests — verify GET /api/v1/places/search and
     GET /api/v1/places/nearby work when the indexes are loaded, return
     503 DATA_UNAVAILABLE when they're not, and that POST /api/v1/predict
     includes the named_pois field when the NamedPOIIndex is loaded.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure backend/ and src/ are importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))


# ----------------------------------------------------------------------
# GPKG fixture builders — tiny GeoDataFrames written to tmp_path
# ----------------------------------------------------------------------


def _write_places_gpkg(tmp_path: Path) -> str:
    """Write a tiny kenya_places.gpkg with 5 well-known Kenyan places."""
    import geopandas as gpd
    from shapely.geometry import Point

    gdf = gpd.GeoDataFrame(
        {
            "name": ["Nairobi", "Ruiru", "Karen", "Nakuru", "Mombasa"],
            "place_type": ["city", "town", "suburb", "town", "city"],
            "county": [None, None, None, None, None],  # filled by backend later
            "subtitle": [
                "Nairobi Metropolitan — city",
                "Nairobi Metropolitan — town",
                "Nairobi Metropolitan — suburb",
                "Kenya — town",
                "Kenya — city",
            ],
            "population": [4_000_000, 500_000, 100_000, 300_000, 1_200_000],
        },
        geometry=[
            Point(36.8219, -1.2921),  # Nairobi
            Point(36.96, -1.15),  # Ruiru
            Point(36.73, -1.32),  # Karen
            Point(36.07, -0.30),  # Nakuru
            Point(39.67, -4.04),  # Mombasa
        ],
        crs="EPSG:4326",
    )
    path = str(tmp_path / "kenya_places.gpkg")
    gdf.to_file(path, driver="GPKG")
    return path


def _write_named_pois_gpkg(tmp_path: Path) -> str:
    """Write a tiny kenya_pois_named.gpkg with 5 named POIs across categories."""
    import geopandas as gpd
    from shapely.geometry import Point

    gdf = gpd.GeoDataFrame(
        {
            "name": [
                "St. Joseph Academy",
                "Ruiru Level 4 Hospital",
                "Karen Shopping Centre",
                "KCB Karen",
                "Unknown POI",
            ],
            "amenity": ["school", "hospital", "marketplace", "bank", None],
            "shop": [None, None, "supermarket", None, None],
            "highway": [None, None, None, None, "bus_stop"],
        },
        geometry=[
            Point(36.83, -1.28),  # ~2 km from Nairobi CBD
            Point(36.97, -1.15),  # in Ruiru
            Point(36.73, -1.32),  # in Karen
            Point(36.74, -1.31),  # near Karen
            Point(36.90, -1.25),  # ~8 km from Nairobi
        ],
        crs="EPSG:4326",
    )
    path = str(tmp_path / "kenya_pois_named.gpkg")
    gdf.to_file(path, driver="GPKG")
    return path


# ----------------------------------------------------------------------
# PlacesIndex unit tests
# ----------------------------------------------------------------------


class TestPlacesIndex:
    def test_load_and_search(self, tmp_path):
        from app.services.places_index import PlacesIndex

        path = _write_places_gpkg(tmp_path)
        idx = PlacesIndex(gpkg_path=path).load()
        assert idx.loaded is True
        assert idx.n_places == 5

        # Substring search "na" should match Nairobi and Nakuru (both contain "na")
        results = idx.search("na", limit=10)
        names = {r.name for r in results}
        assert "Nairobi" in names
        assert "Nakuru" in names
        # Karen, Mombasa, Ruiru don't contain "na"
        assert "Karen" not in names
        assert "Mombasa" not in names
        assert "Ruiru" not in names

    def test_exact_match_ranks_first(self, tmp_path):
        from app.services.places_index import PlacesIndex

        path = _write_places_gpkg(tmp_path)
        idx = PlacesIndex(gpkg_path=path).load()
        # "Nairobi" is an exact match; it should rank before "Nakuru"
        results = idx.search("nairobi", limit=10)
        assert results[0].name == "Nairobi"

    def test_city_ranks_above_town_for_same_prefix(self, tmp_path):
        """When two places start with the same substring, the city outranks
        the town (place_type rank)."""
        from app.services.places_index import PlacesIndex

        path = _write_places_gpkg(tmp_path)
        idx = PlacesIndex(gpkg_path=path).load()
        # "n" matches Nairobi (city), Nakuru (town), Karen (suburb)
        results = idx.search("n", limit=10)
        assert results[0].name == "Nairobi"  # city first
        # Nakuru (town) before Karen (suburb)
        nakuru_idx = next(i for i, r in enumerate(results) if r.name == "Nakuru")
        karen_idx = next(i for i, r in enumerate(results) if r.name == "Karen")
        assert nakuru_idx < karen_idx

    def test_limit_respected(self, tmp_path):
        from app.services.places_index import PlacesIndex

        path = _write_places_gpkg(tmp_path)
        idx = PlacesIndex(gpkg_path=path).load()
        results = idx.search("n", limit=2)
        assert len(results) == 2

    def test_empty_query_returns_empty(self, tmp_path):
        from app.services.places_index import PlacesIndex

        path = _write_places_gpkg(tmp_path)
        idx = PlacesIndex(gpkg_path=path).load()
        assert idx.search("", limit=10) == []

    def test_nearest_named_town(self, tmp_path):
        from app.services.places_index import PlacesIndex

        path = _write_places_gpkg(tmp_path)
        idx = PlacesIndex(gpkg_path=path).load()
        # Point near Karen
        town = idx.nearest_named_town(-1.32, 36.73)
        assert town is not None
        assert town.name == "Karen"

    def test_load_returns_false_when_file_missing(self, tmp_path):
        from app.services.places_index import PlacesIndex

        idx = PlacesIndex(gpkg_path=str(tmp_path / "nonexistent.gpkg")).load()
        assert idx.loaded is False
        assert idx.search("nairobi") == []
        assert idx.nearest_named_town(-1.29, 36.82) is None


# ----------------------------------------------------------------------
# NamedPOIIndex unit tests
# ----------------------------------------------------------------------


class TestNamedPOIIndex:
    def test_load_and_per_category_counts(self, tmp_path):
        from app.services.named_poi_index import NamedPOIIndex

        path = _write_named_pois_gpkg(tmp_path)
        idx = NamedPOIIndex(gpkg_path=path).load()
        assert idx.loaded is True
        assert idx.n_pois == 5
        assert idx.n_per_category["school"] == 1
        assert idx.n_per_category["hospital"] == 1
        assert idx.n_per_category["market"] == 1
        assert idx.n_per_category["bank"] == 1
        assert idx.n_per_category["bus_stop"] == 1

    def test_nearby_within_radius(self, tmp_path):
        from app.services.named_poi_index import NamedPOIIndex

        path = _write_named_pois_gpkg(tmp_path)
        idx = NamedPOIIndex(gpkg_path=path).load()
        # Point at Nairobi CBD — St. Joseph Academy is ~2 km away
        pois = idx.nearby_named_pois(-1.2921, 36.8219, radius_km=5.0, limit=10)
        names = {p.name for p in pois}
        assert "St. Joseph Academy" in names
        # Ruiru Hospital is ~20 km away — not within 5 km
        assert "Ruiru Level 4 Hospital" not in names

    def test_nearby_sorted_by_distance(self, tmp_path):
        from app.services.named_poi_index import NamedPOIIndex

        path = _write_named_pois_gpkg(tmp_path)
        idx = NamedPOIIndex(gpkg_path=path).load()
        # Point near Karen — Karen Shopping Centre and KCB Karen are both close
        pois = idx.nearby_named_pois(-1.32, 36.73, radius_km=5.0, limit=10)
        assert len(pois) >= 2
        # Sorted by distance ascending
        dists = [p.distance_km for p in pois]
        assert dists == sorted(dists)

    def test_category_filter(self, tmp_path):
        from app.services.named_poi_index import NamedPOIIndex

        path = _write_named_pois_gpkg(tmp_path)
        idx = NamedPOIIndex(gpkg_path=path).load()
        # Only hospitals within 50 km of Nairobi
        pois = idx.nearby_named_pois(-1.29, 36.82, radius_km=50.0, category="hospital", limit=10)
        assert all(p.category == "hospital" for p in pois)
        assert any(p.name == "Ruiru Level 4 Hospital" for p in pois)

    def test_load_returns_false_when_file_missing(self, tmp_path):
        from app.services.named_poi_index import NamedPOIIndex

        idx = NamedPOIIndex(gpkg_path=str(tmp_path / "nonexistent.gpkg")).load()
        assert idx.loaded is False
        assert idx.nearby_named_pois(-1.29, 36.82) == []


# ----------------------------------------------------------------------
# Endpoint integration tests
# ----------------------------------------------------------------------


class TestPlacesSearchEndpoint:
    def test_search_happy_path(self, app, tmp_path, client):
        """GET /api/v1/places/search?q=na returns ranked matches."""
        path = _write_places_gpkg(tmp_path)
        from app.services.places_index import PlacesIndex

        app.state.places_index = PlacesIndex(gpkg_path=path).load()
        resp = client.get("/api/v1/places/search?q=na&limit=10")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["query"] == "na"
        names = {r["name"] for r in body["results"]}
        assert "Nairobi" in names
        assert "Nakuru" in names
        # Each result has the expected fields
        r0 = body["results"][0]
        assert "name" in r0
        assert "place_type" in r0
        assert "subtitle" in r0
        assert "latitude" in r0
        assert "longitude" in r0

    def test_search_503_when_index_absent(self, client):
        """When the places index isn't loaded, returns 503 DATA_UNAVAILABLE."""
        # The conftest's app fixture doesn't set up a places index — but
        # the lifespan does set app.state.places_index = PlacesIndex(...).load()
        # with a non-existent path, so it loads=False.  Verify the 503.
        resp = client.get("/api/v1/places/search?q=na")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"

    def test_search_422_when_q_too_short(self, client):
        resp = client.get("/api/v1/places/search?q=")
        assert resp.status_code == 422


class TestPlacesNearbyEndpoint:
    def test_nearby_happy_path(self, app, tmp_path, client):
        path = _write_named_pois_gpkg(tmp_path)
        from app.services.named_poi_index import NamedPOIIndex

        app.state.named_poi_index = NamedPOIIndex(gpkg_path=path).load()
        resp = client.get("/api/v1/places/nearby?lat=-1.2921&lon=36.8219&radius_km=5")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["lat"] == -1.2921
        assert body["lon"] == 36.8219
        assert body["radius_km"] == 5.0
        names = {p["name"] for p in body["pois"]}
        assert "St. Joseph Academy" in names
        # Each POI has the expected fields
        p0 = body["pois"][0]
        assert "name" in p0
        assert "category" in p0
        assert "distance_km" in p0

    def test_nearby_with_category_filter(self, app, tmp_path, client):
        path = _write_named_pois_gpkg(tmp_path)
        from app.services.named_poi_index import NamedPOIIndex

        app.state.named_poi_index = NamedPOIIndex(gpkg_path=path).load()
        resp = client.get(
            "/api/v1/places/nearby?lat=-1.29&lon=36.82&radius_km=50&category=hospital"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert all(p["category"] == "hospital" for p in body["pois"])

    def test_nearby_503_when_index_absent(self, client):
        resp = client.get("/api/v1/places/nearby?lat=-1.29&lon=36.82&radius_km=5")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"

    def test_nearby_422_when_lat_out_of_range(self, client):
        resp = client.get("/api/v1/places/nearby?lat=95&lon=36.82&radius_km=5")
        assert resp.status_code == 422


# ----------------------------------------------------------------------
# Predict endpoint integration — named_pois field
# ----------------------------------------------------------------------


class TestPredictNamedPOIsIntegration:
    def test_predict_includes_named_pois(self, app, tmp_path, client):
        """POST /api/v1/predict includes named_pois when the NamedPOIIndex
        is loaded alongside the prediction service."""
        path = _write_named_pois_gpkg(tmp_path)
        from app.services.named_poi_index import NamedPOIIndex

        app.state.named_poi_index = NamedPOIIndex(gpkg_path=path).load()

        # Build the stub prediction infrastructure (same as test_predict.py)
        # We need a working prediction service to get past the 503 guard.
        from backend.tests.test_predict import _StubFeaturePipeline, _StubRegistry  # type: ignore
        from landval.modelling import PredictionService

        registry = _StubRegistry()
        ps = PredictionService(
            registry=registry,
            feature_pipeline=_StubFeaturePipeline(county="Nairobi"),
            artifacts_dir="/tmp/unused",
        )
        app.state.model_registry = registry
        app.state.prediction_service = ps
        app.state.explanation_service = None
        app.state.comparables_service = None

        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": -1.2921,
                "lon": 36.8219,
                "size_acres": 1.0,
                "confidence_level": 0.8,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # named_pois is present (may be empty if no POIs within 5 km of the stub)
        assert "named_pois" in body
        assert isinstance(body["named_pois"], list)

    def test_predict_named_pois_empty_when_index_absent(self, app, client):
        """When the NamedPOIIndex isn't loaded, named_pois is an empty list
        — the prediction itself still succeeds."""
        from backend.tests.test_predict import _StubFeaturePipeline, _StubRegistry  # type: ignore
        from landval.modelling import PredictionService

        registry = _StubRegistry()
        ps = PredictionService(
            registry=registry,
            feature_pipeline=_StubFeaturePipeline(county="Nairobi"),
            artifacts_dir="/tmp/unused",
        )
        app.state.model_registry = registry
        app.state.prediction_service = ps
        app.state.explanation_service = None
        app.state.comparables_service = None
        # named_poi_index stays as the lifespan set it (loaded=False)

        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": -1.29,
                "lon": 36.82,
                "size_acres": 1.0,
                "confidence_level": 0.8,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["named_pois"] == []
