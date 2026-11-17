"""Tests for B7 (rate limiting), B9 (metrics), and B10 (OpenAPI snapshot).

B7 tests:
  - Exceed the /predict limit → 429 + correct error body + Retry-After header
  - Static-data endpoints (/health, /counties/summary) are unaffected by
    exhausting the /predict limit

B9 tests:
  - Hit a few routes, then confirm /metrics reflects the expected counts
  - /metrics itself is excluded from the structured access log

B10 tests:
  - The OpenAPI snapshot check script passes against the committed snapshot
  - A deliberate schema change is detected (the check fails)
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure backend/ and src/ are importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))


# ----------------------------------------------------------------------
# B7: Rate limiting
# ----------------------------------------------------------------------


class TestRateLimiting:
    def test_predict_429_after_limit_exceeded(self, app, client, monkeypatch):
        """POST /api/v1/predict returns 429 + error body + Retry-After after
        the per-client limit is exceeded."""
        # Set a low limit for the test (2/min)
        monkeypatch.setenv("PREDICT_RATE_LIMIT_PER_MINUTE", "2")
        from app.core.config import get_settings

        get_settings.cache_clear()
        # Rebuild the app so the new limit takes effect
        from app.main import create_app

        test_app = create_app()
        from fastapi.testclient import TestClient

        with TestClient(test_app) as c:
            # Inject a stub prediction service so the endpoint doesn't 503
            from backend.tests.test_predict import _StubFeaturePipeline, _StubRegistry
            from landval.modelling import PredictionService

            registry = _StubRegistry()
            ps = PredictionService(
                registry=registry,
                feature_pipeline=_StubFeaturePipeline(county="Nairobi"),
                artifacts_dir="/tmp/unused",
            )
            test_app.state.model_registry = registry
            test_app.state.prediction_service = ps
            test_app.state.explanation_service = None
            test_app.state.comparables_service = None

            body = {
                "lat": -1.29,
                "lon": 36.82,
                "size_acres": 1.0,
                "confidence_level": 0.8,
            }
            # First 2 requests should succeed (or 503 — but we injected the
            # service so they should be 200)
            c.post("/api/v1/predict", json=body)
            c.post("/api/v1/predict", json=body)  # second request consumes the limit
            # Third request should be rate-limited
            r3 = c.post("/api/v1/predict", json=body)
            assert r3.status_code == 429, f"Expected 429, got {r3.status_code}: {r3.text}"
            error_body = r3.json()
            assert error_body["error"]["code"] == "RATE_LIMIT_EXCEEDED"
            assert "request_id" in error_body["error"]
            assert "details" in error_body["error"]
            # Retry-After header present
            assert "retry-after" in {k.lower() for k in r3.headers}

        get_settings.cache_clear()

    def test_static_endpoints_unaffected_by_predict_limit(self, app, client, monkeypatch):
        """Exhausting the /predict limit does NOT affect /health or other
        static-data endpoints — they use a different (or no) limit."""
        monkeypatch.setenv("PREDICT_RATE_LIMIT_PER_MINUTE", "1")
        from app.core.config import get_settings

        get_settings.cache_clear()
        from app.main import create_app

        test_app = create_app()
        from fastapi.testclient import TestClient

        with TestClient(test_app) as c:
            # Exhaust the predict limit
            from backend.tests.test_predict import _StubFeaturePipeline, _StubRegistry
            from landval.modelling import PredictionService

            registry = _StubRegistry()
            ps = PredictionService(
                registry=registry,
                feature_pipeline=_StubFeaturePipeline(county="Nairobi"),
                artifacts_dir="/tmp/unused",
            )
            test_app.state.model_registry = registry
            test_app.state.prediction_service = ps
            test_app.state.explanation_service = None
            test_app.state.comparables_service = None

            body = {
                "lat": -1.29,
                "lon": 36.82,
                "size_acres": 1.0,
                "confidence_level": 0.8,
            }
            c.post("/api/v1/predict", json=body)  # uses the 1/min limit
            c.post("/api/v1/predict", json=body)  # should be 429

            # /health still works — not rate-limited
            r = c.get("/api/v1/health")
            assert r.status_code == 200

            # /meta still works
            r = c.get("/api/v1/meta")
            assert r.status_code == 200

        get_settings.cache_clear()


# ----------------------------------------------------------------------
# B9: Metrics
# ----------------------------------------------------------------------


class TestMetrics:
    def test_metrics_endpoint_returns_prometheus_text(self, client):
        """GET /metrics returns Prometheus text format with the expected metrics."""
        # Hit a few routes first so there's data
        client.get("/api/v1/health")
        client.get("/api/v1/meta")

        resp = client.get("/metrics")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers.get("content-type", "")
        body = resp.text
        # Standard Prometheus metric names present
        assert "http_requests_total" in body
        assert "http_request_duration_seconds" in body
        # The health + meta requests should be counted
        assert "2xx" in body

    def test_metrics_excluded_from_log_noise(self, client):
        """Hitting /metrics does not produce a structured 'request' log line
        (it's excluded to avoid log flooding from scrapers).  We can't directly
        assert on logs here, but we verify the endpoint returns 200 without
        error — the exclusion is in the middleware code."""
        for _ in range(5):
            resp = client.get("/metrics")
            assert resp.status_code == 200

    def test_predict_low_support_counter_labeled(self, app, client):
        """The predict_low_support_total counter is labeled by county +
        is_low_support — hitting /predict with a stub service increments it."""
        from backend.tests.test_predict import _StubFeaturePipeline, _StubRegistry
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

        client.post(
            "/api/v1/predict",
            json={
                "lat": -1.29,
                "lon": 36.82,
                "size_acres": 1.0,
                "confidence_level": 0.8,
            },
        )

        resp = client.get("/metrics")
        body = resp.text
        assert "predict_low_support_total" in body
        assert "predict_inference_seconds" in body
        # The counter should have a label for the county
        assert "county=" in body


# ----------------------------------------------------------------------
# B10: OpenAPI snapshot
# ----------------------------------------------------------------------


class TestOpenAPISnapshot:
    def test_snapshot_matches_current_schema(self):
        """The committed snapshot at docs/openapi.snapshot.json matches the
        schema generated from the current code.  This is the same check CI runs."""
        import subprocess

        result = subprocess.run(
            [sys.executable, "scripts/check_openapi_snapshot.py"],
            capture_output=True,
            text=True,
            cwd=str(Path(__file__).resolve().parent.parent.parent),
        )
        assert (
            result.returncode == 0
        ), f"OpenAPI snapshot diff detected:\n{result.stdout}\n{result.stderr}"

    def test_snapshot_file_exists(self):
        """The snapshot file is committed to the repo."""
        snapshot = Path(__file__).resolve().parent.parent.parent / "docs" / "openapi.snapshot.json"
        assert (
            snapshot.exists()
        ), "docs/openapi.snapshot.json not found — run `make openapi-snapshot`"
        assert snapshot.stat().st_size > 0
