"""Integration tests for authentication endpoints."""

import pytest
from httpx import AsyncClient


class TestRegister:
    """Test registration endpoint."""

    async def test_register_returns_201_and_access_token(
        self, test_client: AsyncClient
    ):
        """Test successful registration."""
        response = await test_client.post(
            "/api/v1/auth/register",
            json={"email": "newuser@example.com", "password": "SecurePass123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_register_duplicate_email_returns_409(
        self, test_client: AsyncClient, registered_user: dict
    ):
        """Test duplicate email returns 409."""
        response = await test_client.post(
            "/api/v1/auth/register",
            json={"email": registered_user["email"], "password": "AnotherPass123"},
        )
        assert response.status_code == 409
        assert "already registered" in response.json()["detail"]

    async def test_register_password_no_digit_returns_422(
        self, test_client: AsyncClient
    ):
        """Test password without digit returns 422."""
        response = await test_client.post(
            "/api/v1/auth/register",
            json={"email": "test2@example.com", "password": "NoDigitsHere"},
        )
        assert response.status_code == 422

    async def test_register_password_too_short_returns_422(
        self, test_client: AsyncClient
    ):
        """Test short password returns 422."""
        response = await test_client.post(
            "/api/v1/auth/register",
            json={"email": "test3@example.com", "password": "Short1"},
        )
        assert response.status_code == 422


class TestLogin:
    """Test login endpoint."""

    async def test_login_correct_credentials_returns_200_and_token(
        self, test_client: AsyncClient, registered_user: dict
    ):
        """Test successful login."""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={
                "email": registered_user["email"],
                "password": registered_user["password"],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    async def test_login_wrong_password_returns_401(
        self, test_client: AsyncClient, registered_user: dict
    ):
        """Test wrong password returns 401."""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": registered_user["email"], "password": "WrongPass123"},
        )
        assert response.status_code == 401

    async def test_login_unknown_email_returns_401(self, test_client: AsyncClient):
        """Test unknown email returns 401."""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": "unknown@example.com", "password": "SomePass123"},
        )
        assert response.status_code == 401


class TestMe:
    """Test current user endpoint."""

    async def test_me_with_valid_token_returns_user_object(
        self, test_client: AsyncClient, auth_headers: dict, registered_user: dict
    ):
        """Test getting current user info."""
        response = await test_client.get("/api/v1/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == registered_user["email"]
        assert "id" in data
        assert "role" in data

    async def test_me_without_token_returns_401(self, test_client: AsyncClient):
        """Test no token returns 401."""
        response = await test_client.get("/api/v1/auth/me")
        assert response.status_code == 401

    async def test_me_with_expired_token_returns_401(self, test_client: AsyncClient):
        """Test expired token returns 401."""
        import time

        import jwt
        from app.core.config import get_settings

        settings = get_settings()
        expired_payload = {"sub": "1", "exp": time.time() - 1000}
        expired_token = jwt.encode(
            expired_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )

        response = await test_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert response.status_code == 401
