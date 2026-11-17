"""Health endpoint tests."""

from fastapi.testclient import TestClient


def test_health_returns_ok_structure(client: TestClient):
    """/health returns the expected JSON shape."""
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert "status" in body
    assert "artifacts_loaded" in body
    assert "version" in body


def test_health_degraded_when_no_artifacts(client: TestClient):
    """With an empty artifacts dir, status is 'degraded'."""
    resp = client.get("/api/v1/health")
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["artifacts_loaded"] is False


def test_health_has_request_id_header(client: TestClient):
    """The x-request-id header is present in every response."""
    resp = client.get("/api/v1/health")
    assert "x-request-id" in resp.headers


def test_health_echoes_provided_request_id(client: TestClient):
    """A request-id provided by the client is echoed back."""
    rid = "test-req-id-12345"
    resp = client.get("/api/v1/health", headers={"x-request-id": rid})
    assert resp.headers["x-request-id"] == rid
