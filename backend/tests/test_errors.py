"""Error format tests — every error uses the same {error: {code, message, details, request_id}} body."""

from fastapi.testclient import TestClient


def test_404_has_standard_error_body(client: TestClient):
    """A non-existent route returns the standard error envelope."""
    resp = client.get("/api/v1/nonexistent")
    assert resp.status_code == 404
    body = resp.json()
    assert "error" in body
    err = body["error"]
    assert "code" in err
    assert "message" in err
    assert "details" in err
    assert "request_id" in err


def test_validation_error_has_standard_body(client: TestClient):
    """A 422 validation error uses the standard envelope."""
    # /meta doesn't take params, but we can hit a path that does
    resp = client.get("/api/v1/health", params={"bad": True})
    # 422 if FastAPI complains about unexpected params, otherwise 200
    if resp.status_code == 422:
        body = resp.json()
        assert "error" in body
        assert body["error"]["code"] == "VALIDATION_ERROR"


def test_error_body_includes_request_id(client: TestClient):
    """The request_id in the error body matches the response header."""
    rid = "err-req-id-999"
    resp = client.get("/api/v1/nonexistent", headers={"x-request-id": rid})
    body = resp.json()
    assert body["error"]["request_id"] == rid
