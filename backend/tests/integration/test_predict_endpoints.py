"""Integration tests for prediction endpoints."""

import pytest
from httpx import AsyncClient


class TestPredict:
    """Test prediction endpoint."""

    async def test_predict_without_auth_returns_401(self, test_client: AsyncClient):
        """Test prediction without auth returns 401."""
        response = await test_client.post(
            "/api/v1/predict",
            json={
                "location_text": "Nairobi",
                "size_acres": 2.5,
                "amenity_score": 50,
                "accessibility_score": 50,
                "infrastructure_score": 50,
            },
        )
        assert response.status_code == 401

    @pytest.mark.skip(reason="Requires model to be loaded")
    async def test_predict_valid_request_returns_201_with_nonzero_price(
        self, test_client: AsyncClient, auth_headers: dict
    ):
        """Test valid prediction request."""
        response = await test_client.post(
            "/api/v1/predict",
            headers=auth_headers,
            json={
                "location_text": "Nairobi",
                "size_acres": 2.5,
                "amenity_score": 50,
                "accessibility_score": 50,
                "infrastructure_score": 50,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["price_per_acre_ksh"] > 0
        assert data["price_total_ksh"] > 0

    async def test_predict_zero_size_returns_422(
        self, test_client: AsyncClient, auth_headers: dict
    ):
        """Test zero size returns 422."""
        response = await test_client.post(
            "/api/v1/predict",
            headers=auth_headers,
            json={
                "location_text": "Nairobi",
                "size_acres": 0,
                "amenity_score": 50,
                "accessibility_score": 50,
                "infrastructure_score": 50,
            },
        )
        assert response.status_code == 422

    async def test_predict_score_over_100_returns_422(
        self, test_client: AsyncClient, auth_headers: dict
    ):
        """Test score over 100 returns 422."""
        response = await test_client.post(
            "/api/v1/predict",
            headers=auth_headers,
            json={
                "location_text": "Nairobi",
                "size_acres": 2.5,
                "amenity_score": 150,
                "accessibility_score": 50,
                "infrastructure_score": 50,
            },
        )
        assert response.status_code == 422

    @pytest.mark.skip(reason="Requires model to be loaded")
    async def test_predict_saves_prediction_to_database(
        self, test_client: AsyncClient, auth_headers: dict
    ):
        """Test prediction is saved to database."""
        response = await test_client.post(
            "/api/v1/predict",
            headers=auth_headers,
            json={
                "location_text": "Nairobi",
                "size_acres": 2.5,
                "amenity_score": 50,
                "accessibility_score": 50,
                "infrastructure_score": 50,
            },
        )
        assert response.status_code == 201

        # Check history
        history_response = await test_client.get(
            "/api/v1/predict/history", headers=auth_headers
        )
        assert history_response.status_code == 200
        history = history_response.json()
        assert history["total"] >= 1

    @pytest.mark.skip(reason="Requires model to be loaded")
    async def test_predict_response_contains_feature_breakdown(
        self, test_client: AsyncClient, auth_headers: dict
    ):
        """Test response contains feature breakdown."""
        response = await test_client.post(
            "/api/v1/predict",
            headers=auth_headers,
            json={
                "location_text": "Nairobi",
                "size_acres": 2.5,
                "amenity_score": 50,
                "accessibility_score": 50,
                "infrastructure_score": 50,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "features" in data
        assert len(data["features"]) > 0


class TestHistory:
    """Test prediction history endpoint."""

    async def test_history_empty_for_new_user(
        self, test_client: AsyncClient, auth_headers: dict
    ):
        """Test empty history for new user."""
        response = await test_client.get(
            "/api/v1/predict/history", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_history_pagination_works_correctly(
        self, test_client: AsyncClient, auth_headers: dict
    ):
        """Test pagination parameters."""
        response = await test_client.get(
            "/api/v1/predict/history?page=1&limit=5", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "page" in data
        assert "pages" in data

    async def test_history_never_shows_other_user_predictions(
        self, test_client: AsyncClient, registered_user: dict
    ):
        """Test history isolation between users."""
        # This would require creating a second user and verifying isolation
        pass
