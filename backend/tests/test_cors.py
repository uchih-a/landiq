"""CORS configuration tests."""

from fastapi.testclient import TestClient


def test_cors_allows_configured_origin(client: TestClient):
    """An origin in ALLOWED_ORIGINS gets a CORS allow header."""
    resp = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code in (200, 204)
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_rejects_unknown_origin(client: TestClient):
    """An origin not in the allow list gets no CORS header."""
    resp = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    allow = resp.headers.get("access-control-allow-origin")
    # The CORS middleware should not echo back an unallowed origin
    assert allow is None or allow != "http://evil.example.com"


def test_cors_exposes_request_id(client: TestClient):
    """The x-request-id header is in the CORS expose list."""
    resp = client.get(
        "/api/v1/health",
        headers={"Origin": "http://localhost:3000"},
    )
    exposed = resp.headers.get("access-control-expose-headers", "")
    assert "x-request-id" in exposed
