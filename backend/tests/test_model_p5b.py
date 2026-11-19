"""Tests for the P5b Model Performance backend additions:
/model/metrics new fields + /model/error-by-support band_order.

Reuses the tiny metrics fixtures from test_app_exports (which now carry
the full metrics.json interval_coverage_weighted_ensemble block).
"""

from __future__ import annotations

import pandas as pd
import pytest

from tests.test_app_exports import (
    _tiny_manifest,
    _tiny_metrics_json,
    _tiny_metrics_table,
    _write_app_exports,
)


def _p5b_exports(*, with_test_parquet: bool = True) -> dict:
    exports = {
        "manifest.json": _tiny_manifest(),
        "metrics_table.csv": _tiny_metrics_table(),
        "metrics.json": _tiny_metrics_json(),
    }
    if with_test_parquet:
        # A tiny predictions parquet so n_test/n_dev are populated.
        exports["test_predictions.parquet"] = pd.DataFrame(
            [
                {
                    "listing_url": None,
                    "listing_no": "L001",
                    "title": None,
                    "location": None,
                    "county": "Nairobi",
                    "prop_type": "Land",
                    "latitude": -1.32,
                    "longitude": 36.73,
                    "price_ksh": 4.5e6,
                    "y_true": 15.32,
                    "pred_xgb": 15.28,
                    "pred_catboost": 15.35,
                    "pred_tabnet": 15.20,
                    "pred_simple_average": 15.28,
                    "pred_weighted_ensemble": 15.32,
                    "fold": -1,
                    "split": "test",
                }
            ]
        )
        exports["oof_predictions.parquet"] = pd.DataFrame(
            [
                {
                    "listing_url": None,
                    "listing_no": "L002",
                    "title": None,
                    "location": None,
                    "county": "Kiambu",
                    "prop_type": "Land",
                    "latitude": -1.03,
                    "longitude": 36.83,
                    "price_ksh": 2.8e6,
                    "y_true": 14.85,
                    "pred_xgb": 14.80,
                    "pred_catboost": 14.90,
                    "pred_tabnet": 14.75,
                    "pred_simple_average": 14.82,
                    "pred_weighted_ensemble": 14.85,
                    "fold": 0,
                    "split": "dev",
                }
            ]
        )
    return exports


@pytest.fixture
def p5b_app(app, tmp_path):
    _write_app_exports(tmp_path, _p5b_exports())
    from app.services.app_exports import AppExportsRegistry

    app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
    yield app


class TestModelMetricsP5b:
    def test_new_fields_present(self, p5b_app, client):
        body = client.get("/api/v1/model/metrics").json()
        for key in (
            "ensemble_model",
            "production_run_label",
            "interval_levels",
            "default_interval_level",
            "interval_method",
            "n_test",
            "n_dev",
            "model_info",
        ):
            assert key in body, f"missing: {key}"

    def test_ensemble_model_matches_production_run_row(self, p5b_app, client):
        """The tiny fixture's production run ("Run A") has a
        weighted_ensemble row -> ensemble_model = "weighted_ensemble"."""
        body = client.get("/api/v1/model/metrics").json()
        assert body["ensemble_model"] == "weighted_ensemble"

    def test_ensemble_model_null_when_no_ensemble_row(self, app, tmp_path):
        """A metrics table with only member models (no weighted_ensemble
        row) -> ensemble_model null (the frontend shows 'not available')."""
        exports = _p5b_exports()
        table = _tiny_metrics_table()
        table = table[table["model"] != "weighted_ensemble"]
        exports["metrics_table.csv"] = table
        _write_app_exports(tmp_path, exports)
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/model/metrics").json()
            assert body["ensemble_model"] is None

    def test_interval_levels_from_artifact(self, p5b_app, client):
        """The tiny metrics.json carries levels 0.5 + 0.8 in
        interval_coverage_weighted_ensemble -> interval_levels = [0.5, 0.8]."""
        body = client.get("/api/v1/model/metrics").json()
        assert body["interval_levels"] == [0.5, 0.8]
        assert body["default_interval_level"] == 0.8

    def test_n_test_n_dev_from_parquets(self, p5b_app, client):
        body = client.get("/api/v1/model/metrics").json()
        assert body["n_test"] == 1
        assert body["n_dev"] == 1

    def test_n_test_null_when_parquet_missing(self, app, tmp_path):
        exports = _p5b_exports(with_test_parquet=False)
        _write_app_exports(tmp_path, exports)
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/model/metrics").json()
            assert body["n_test"] is None
            assert body["n_dev"] is None

    def test_interval_method_documented(self, p5b_app, client):
        body = client.get("/api/v1/model/metrics").json()
        assert body["interval_method"] == "multiplicative split-conformal"

    def test_model_info_families(self, p5b_app, client):
        """Only the models present in the table are reported, with the
        documented display names + families."""
        body = client.get("/api/v1/model/metrics").json()
        assert body["model_info"]["weighted_ensemble"]["family"] == "ensemble"
        assert body["model_info"]["xgb"]["display_name"] == "XGBoost"

    def test_no_nan_in_json(self, p5b_app, client):
        import json
        import math

        body = json.loads(client.get("/api/v1/model/metrics").text)

        def _walk(o):
            if isinstance(o, dict):
                for v in o.values():
                    _walk(v)
            elif isinstance(o, list):
                for v in o:
                    _walk(v)
            elif isinstance(o, float):
                assert math.isfinite(o)

        _walk(body)


class TestErrorBySupportP5b:
    """The error-by-support endpoint 503s without the model registry; the
    band_order logic is exercised through a direct service-level test
    instead (the registry needs real artifacts)."""

    def test_endpoint_503_without_registry(self, client):
        resp = client.get("/api/v1/model/error-by-support")
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "DATA_UNAVAILABLE"

    def test_band_order_sorting(self):
        """The band_order assignment (ascending ordinal within a
        support_measure group, parsed from the band label) is correct."""
        from app.api.v1.routers.model import _band_sort_key

        bands = ["<5", "5-9", "10-19", "20-49", "50+"]
        ordered = sorted(bands, key=_band_sort_key)
        assert ordered == bands
        # The "<10 (below COVERAGE_MIN_COUNTY_N)" label sorts below "10-19".
        bands2 = ["<10 (below COVERAGE_MIN_COUNTY_N)", "10-19", "20-49", "50+"]
        assert sorted(bands2, key=_band_sort_key) == bands2

    def test_band_order_assigned_on_rows(self):
        """Simulate the router's grouping: 2 measures, each band gets an
        ascending ordinal."""
        rows = [
            {
                "support_measure": "county_listings",
                "band": "10-19",
                "n_listings": 5,
                "oof_rmse": 0.5,
                "oof_mae": 0.4,
            },
            {
                "support_measure": "county_listings",
                "band": "<10 (below COVERAGE_MIN_COUNTY_N)",
                "n_listings": 2,
                "oof_rmse": 0.7,
                "oof_mae": 0.6,
            },
            {
                "support_measure": "nearby_within_50km",
                "band": "50+",
                "n_listings": 8,
                "oof_rmse": 0.3,
                "oof_mae": 0.2,
            },
            {
                "support_measure": "nearby_within_50km",
                "band": "<5",
                "n_listings": 1,
                "oof_rmse": 0.9,
                "oof_mae": 0.8,
            },
        ]
        from app.schemas.predictions import ErrorBySupportRow

        parsed = [
            ErrorBySupportRow(
                support_measure=r["support_measure"],
                band=r["band"],
                n_listings=r["n_listings"],
                oof_rmse=r["oof_rmse"],
                oof_mae=r["oof_mae"],
                band_order=0,
            )
            for r in rows
        ]
        grouped: dict[str, list] = {}
        for row in parsed:
            grouped.setdefault(row.support_measure, []).append(row)
        from app.api.v1.routers.model import _band_sort_key

        for _measure, group in grouped.items():
            order_by_band = {
                b: i for i, b in enumerate(sorted((row.band for row in group), key=_band_sort_key))
            }
            for row in group:
                row.band_order = order_by_band[row.band]
        cl = {r.band: r.band_order for r in parsed if r.support_measure == "county_listings"}
        assert cl["<10 (below COVERAGE_MIN_COUNTY_N)"] == 0
        assert cl["10-19"] == 1
        nb = {r.band: r.band_order for r in parsed if r.support_measure == "nearby_within_50km"}
        assert nb["<5"] == 0
        assert nb["50+"] == 1
