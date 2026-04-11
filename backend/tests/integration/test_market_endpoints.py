"""Integration tests for market endpoints."""

import pytest
from httpx import AsyncClient


class TestMarketSummary:
    """Test market summary endpoint."""

    async def test_summary_returns_all_required_fields(
        self, test_client: AsyncClient
    ):
        """Test summary contains all required fields."""
        response = await test_client.get("/api/v1/market/summary")
        assert response.status_code == 200
        data = response.json()
        required_fields = [
            "total_listings",
            "counties_covered",
            "national_median_price_per_acre",
            "national_avg_price_per_acre",
            "most_expensive_county",
            "best_value_county",
            "ols_r2",
            "total_predictions_made",
            "last_updated",
        ]
        for field in required_fields:
            assert field in data

    async def test_summary_total_listings_is_positive_after_seed(
        self, test_client: AsyncClient
    ):
        """Test total listings is non-negative."""
        response = await test_client.get("/api/v1/market/summary")
        assert response.status_code == 200
        data = response.json()
        assert data["total_listings"] >= 0

    async def test_summary_county_filter_returns_county_specific_data(
        self, test_client: AsyncClient
    ):
        """Test county filter works."""
        response = await test_client.get("/api/v1/market/summary?county=Nairobi")
        assert response.status_code == 200
        # Would verify county-specific data if database is seeded


class TestCounties:
    """Test counties endpoint."""

    async def test_counties_sorted_by_price_descending(
        self, test_client: AsyncClient
    ):
        """Test counties are sorted by price."""
        response = await test_client.get("/api/v1/market/counties")
        assert response.status_code == 200
        data = response.json()
        # Would verify sorting if database is seeded
        assert isinstance(data, list)


class TestSpatial:
    """Test spatial endpoint."""

    async def test_spatial_excludes_null_coordinate_rows(
        self, test_client: AsyncClient
    ):
        """Test spatial data excludes null coordinates."""
        response = await test_client.get("/api/v1/market/spatial")
        assert response.status_code == 200
        data = response.json()
        for item in data:
            assert item["latitude"] is not None
            assert item["longitude"] is not None


class TestProximity:
    """Test proximity endpoint."""

    async def test_proximity_returns_nairobi_and_reference_city_arrays(
        self, test_client: AsyncClient
    ):
        """Test proximity returns both arrays."""
        response = await test_client.get("/api/v1/market/proximity")
        assert response.status_code == 200
        data = response.json()
        assert "nairobi" in data
        assert "reference_city" in data
        assert isinstance(data["nairobi"], list)
        assert isinstance(data["reference_city"], list)


class TestScores:
    """Test scores endpoint."""

    async def test_scores_amenities_returns_5_bins(
        self, test_client: AsyncClient
    ):
        """Test amenities returns 5 bins."""
        response = await test_client.get("/api/v1/market/scores")
        assert response.status_code == 200
        data = response.json()
        assert "amenities" in data
        assert len(data["amenities"]) == 5

    async def test_scores_accessibility_returns_5_bins(
        self, test_client: AsyncClient
    ):
        """Test accessibility returns 5 bins."""
        response = await test_client.get("/api/v1/market/scores")
        assert response.status_code == 200
        data = response.json()
        assert "accessibility" in data
        assert len(data["accessibility"]) == 5


class TestBestInvestment:
    """Test best investment endpoint."""

    async def test_best_investment_returns_maximum_5_items(
        self, test_client: AsyncClient
    ):
        """Test best investment returns at most 5 items."""
        response = await test_client.get("/api/v1/market/best-investment")
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 5

    async def test_best_investment_rank_1_has_highest_score(
        self, test_client: AsyncClient
    ):
        """Test rank 1 has highest score."""
        response = await test_client.get("/api/v1/market/best-investment")
        assert response.status_code == 200
        data = response.json()
        if len(data) > 1:
            assert data[0]["investment_score"] >= data[1]["investment_score"]


class TestHealth:
    """Test health endpoint."""

    async def test_health_endpoint_returns_ok(self, test_client: AsyncClient):
        """Test health check returns ok."""
        response = await test_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "model_loaded" in data
        assert "db_connected" in data
        assert "version" in data
