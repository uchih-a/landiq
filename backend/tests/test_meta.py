"""Meta endpoint tests."""

from fastapi.testclient import TestClient


def test_meta_returns_nulls_when_degraded(client: TestClient):
    """/meta returns null fields when artifacts are not loaded."""
    resp = client.get("/api/v1/meta")
    assert resp.status_code == 200
    body = resp.json()
    assert body["model_version"] is None
    assert body["data_date"] is None
    assert body["coverage"] is None
    assert body["ensemble_weights"] is None


def test_meta_endpoint_exists(client: TestClient):
    """/meta is under /api/v1."""
    resp = client.get("/api/v1/meta")
    assert resp.status_code == 200
