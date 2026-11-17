"""Tests for GET /api/v1/model/predictions + GET /api/v1/model/error-by-support.

Both endpoints serve data that already exists as artifact files from
Notebook 3 but were never exposed via the API in B3.  These tests use
tiny fixtures — no real multi-MB parquet files required.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))


# Reuse the tiny fixtures from test_app_exports
from backend.tests.test_app_exports import (
    _all_tiny_exports,
    _write_app_exports,
)


class TestModelPredictionsEndpoint:
    def test_happy_path(self, app, tmp_path, client):
        """GET /model/predictions returns both OOF + test sets."""
        _write_app_exports(tmp_path, _all_tiny_exports())
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()

        resp = client.get("/api/v1/model/predictions")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "oof" in body
        assert "test" in body
        assert body["oof_count"] == 2
        assert body["test_count"] == 1
        assert body["sampled"] is False
        assert body["sample_size"] is None

        # OOF rows have the expected columns
        oof_row = body["oof"][0]
        assert oof_row["listing_no"] == "L001"
        assert oof_row["county"] == "Nairobi"
        assert oof_row["split"] == "dev"
        assert "y_true" in oof_row
        assert "pred_xgb" in oof_row
        assert "pred_weighted_ensemble" in oof_row
        assert "fold" in oof_row

        # Test rows have split="test"
        test_row = body["test"][0]
        assert test_row["split"] == "test"
        assert test_row["fold"] == -1

    def test_sample_param(self, app, tmp_path, client):
        """?sample=10 returns a deterministic subset (capped at available rows)."""
        _write_app_exports(tmp_path, _all_tiny_exports())
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()

        resp = client.get("/api/v1/model/predictions?sample=10")
        assert resp.status_code == 200
        body = resp.json()
        assert body["sampled"] is True
        assert body["sample_size"] == 10
        # The fixture has 2 OOF rows and 1 test row — sample is capped at available
        assert len(body["oof"]) <= 2
        assert len(body["test"]) <= 1
        # oof_count still reports the full file's row count
        assert body["oof_count"] == 2
        assert body["test_count"] == 1

    def test_503_when_files_missing(self, client):
        """When the prediction parquets are absent, returns 503 DATA_UNAVAILABLE."""
        resp = client.get("/api/v1/model/predictions")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"


class TestErrorBySupportEndpoint:
    def test_happy_path(self, app, client):
        """GET /model/error-by-support returns the band rows."""
        # error_by_support is loaded by the ModelRegistry, not AppExportsRegistry.
        # We need to inject a stub model_registry with error_by_support populated.
        app.state.model_registry = type(
            "StubReg",
            (),
            {
                "loaded": True,
                "error_by_support": [
                    {
                        "support_measure": "county_listings",
                        "band": "<10 (below COVERAGE_MIN_COUNTY_N)",
                        "n_listings": 45,
                        "oof_rmse": 0.72,
                        "oof_mae": 0.55,
                    },
                    {
                        "support_measure": "county_listings",
                        "band": "10-19",
                        "n_listings": 120,
                        "oof_rmse": 0.58,
                        "oof_mae": 0.42,
                    },
                    {
                        "support_measure": "nearby_within_50km",
                        "band": "<5 (below COVERAGE_MIN_NEARBY_N)",
                        "n_listings": 30,
                        "oof_rmse": 0.81,
                        "oof_mae": 0.60,
                    },
                    {
                        "support_measure": "nearby_within_50km",
                        "band": "50+",
                        "n_listings": 200,
                        "oof_rmse": 0.48,
                        "oof_mae": 0.35,
                    },
                ],
            },
        )()

        resp = client.get("/api/v1/model/error-by-support")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["n_rows"] == 4
        assert body["rows"][0]["support_measure"] == "county_listings"
        assert body["rows"][0]["band"] == "<10 (below COVERAGE_MIN_COUNTY_N)"
        assert body["rows"][0]["n_listings"] == 45
        assert body["rows"][0]["oof_rmse"] == 0.72

    def test_503_when_model_registry_not_loaded(self, client):
        """When the model registry isn't loaded, returns 503 DATA_UNAVAILABLE."""
        # The conftest's app fixture sets model_registry=None
        resp = client.get("/api/v1/model/error-by-support")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"

    def test_503_when_error_by_support_empty(self, app, client):
        """When error_by_support is loaded but empty, returns 503."""
        app.state.model_registry = type(
            "StubReg",
            (),
            {
                "loaded": True,
                "error_by_support": [],
            },
        )()

        resp = client.get("/api/v1/model/error-by-support")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"
