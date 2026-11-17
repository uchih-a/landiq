"""Tests for the read-only data endpoints (Phase B3).

For every endpoint:
  - happy path against a tiny fixture file shaped like the real Phase 9
    export (column names + dtypes match Cell 9.3 / 9.4 / 9.5 / 9.6 / 9.7
    exactly — the same shapes the manifest would report);
  - degraded-mode path: when the file is missing the endpoint returns
    503 ``DATA_UNAVAILABLE`` (not a 500) with the standard error body.

No test requires the real multi-MB export files — every fixture is a
handful of rows written into the tmp_path that the conftest's ``app``
fixture uses as ``ARTIFACTS_DIR``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

# ----------------------------------------------------------------------
# Fixture helpers — write tiny Phase-9-shaped files into app_exports/
# ----------------------------------------------------------------------


def _write_app_exports(artifacts_dir: Path, files: dict[str, object]) -> None:
    """Write a dict of {filename: content} into app_exports/.

    Content may be:
      - a pandas DataFrame (written as CSV or parquet depending on the
        file extension)
      - a JSON-serialisable dict (written as JSON)
      - a str (written as text — used for README-style files in other tests)
    """
    ae = artifacts_dir / "app_exports"
    ae.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        path = ae / name
        if isinstance(content, pd.DataFrame):
            if name.endswith(".csv"):
                content.to_csv(path, index=False)
            elif name.endswith(".parquet"):
                content.to_parquet(path, index=False)
            else:
                raise ValueError(f"unknown DataFrame file type: {name}")
        elif isinstance(content, dict | list):
            path.write_text(json.dumps(content, indent=2))
        elif isinstance(content, str):
            path.write_text(content)
        else:
            raise TypeError(f"unsupported content type for {name}: {type(content)}")


def _tiny_county_summary() -> pd.DataFrame:
    """Cell 9.5 columns: county, n_listings, median_price_per_acre_ksh,
    q1_price_per_acre_ksh, q3_price_per_acre_ksh, mean_log_price_per_acre,
    water_body_distance_share, n_below_min_county_n."""
    return pd.DataFrame(
        {
            "county": ["Nairobi", "Kiambu", "Marsabit"],
            "n_listings": [412, 87, 3],
            "median_price_per_acre_ksh": [4_500_000.0, 2_800_000.0, 600_000.0],
            "q1_price_per_acre_ksh": [3_200_000.0, 1_900_000.0, 450_000.0],
            "q3_price_per_acre_ksh": [7_100_000.0, 4_200_000.0, 850_000.0],
            "mean_log_price_per_acre": [15.32, 14.85, 13.32],
            "water_body_distance_share": [0.0, 0.0, 0.05],
            "n_below_min_county_n": [False, False, True],
        }
    )


def _tiny_metrics_table() -> pd.DataFrame:
    """Cell 9.3 columns — one row per (run, model).  Production run's
    weighted_ensemble row carries trimmed_test_* and interval_coverage_*."""
    return pd.DataFrame(
        [
            {
                "run": "Run A",
                "model": "xgb",
                "cv_rmse_mean": 0.62,
                "cv_rmse_se": 0.012,
                "test_R2": 0.71,
                "test_RMSE": 0.59,
                "test_MAE": 0.42,
                "test_MedAPE_pct": 18.3,
                "test_MAE_KSh_per_acre": 480_000.0,
                "ci95_R2_lo": 0.66,
                "ci95_R2_hi": 0.76,
                "ci95_RMSE_lo": 0.55,
                "ci95_RMSE_hi": 0.63,
                "ci95_MAE_lo": 0.38,
                "ci95_MAE_hi": 0.46,
                "county_group_cv_rmse": 0.71,
                "ensemble_weight": 0.45,
                "trimmed_test_rmse": float("nan"),
                "trimmed_test_rows": float("nan"),
                "interval_coverage_50": float("nan"),
                "interval_width_ratio_50": float("nan"),
                "interval_coverage_80": float("nan"),
                "interval_width_ratio_80": float("nan"),
                "interval_coverage_90": float("nan"),
                "interval_width_ratio_90": float("nan"),
            },
            {
                "run": "Run A",
                "model": "weighted_ensemble",
                "cv_rmse_mean": 0.55,
                "cv_rmse_se": 0.009,
                "test_R2": 0.78,
                "test_RMSE": 0.51,
                "test_MAE": 0.36,
                "test_MedAPE_pct": 15.1,
                "test_MAE_KSh_per_acre": 410_000.0,
                "ci95_R2_lo": 0.74,
                "ci95_R2_hi": 0.82,
                "ci95_RMSE_lo": 0.48,
                "ci95_RMSE_hi": 0.54,
                "ci95_MAE_lo": 0.33,
                "ci95_MAE_hi": 0.39,
                "county_group_cv_rmse": 0.63,
                "ensemble_weight": float("nan"),
                "trimmed_test_rmse": 0.47,
                "trimmed_test_rows": 380,
                "interval_coverage_50": 0.52,
                "interval_width_ratio_50": 1.50,
                "interval_coverage_80": 0.81,
                "interval_width_ratio_80": 2.23,
                "interval_coverage_90": 0.91,
                "interval_width_ratio_90": 3.02,
            },
        ]
    )


def _tiny_metrics_json() -> dict:
    """Cell 9.3 metrics.json structure."""
    return {
        "created": "2025-01-15 10:00:00",
        "production_run": "Run A",
        "runs": {
            "Run A": {
                "features": ["log_size_acres", "county"],
                "ensemble_weights": {"xgb": 0.45, "catboost": 0.55},
            }
        },
        "interval_coverage_weighted_ensemble": [
            {
                "level": 0.5,
                "q_log_scale": 0.20,
                "test_coverage": 0.52,
                "test_median_width_ratio_upper_over_lower": 1.50,
            },
            {
                "level": 0.8,
                "q_log_scale": 0.40,
                "test_coverage": 0.81,
                "test_median_width_ratio_upper_over_lower": 2.23,
            },
        ],
    }


def _tiny_feature_evaluation() -> pd.DataFrame:
    """Cell 3.8 ranked_table columns."""
    return pd.DataFrame(
        [
            {
                "feature": "log_size_acres",
                "group": "size",
                "available": "Yes",
                "missing_%": 0.0,
                "mutual_info": 0.42,
                "perm_delta_rmse": 0.08,
                "mean_abs_shap": 0.15,
                "selection_votes": 4,
                "in_selected_set": True,
            },
            {
                "feature": "dist_to_nairobi_km",
                "group": "proximity",
                "available": "Yes",
                "missing_%": 0.0,
                "mutual_info": 0.31,
                "perm_delta_rmse": 0.05,
                "mean_abs_shap": 0.12,
                "selection_votes": 3,
                "in_selected_set": True,
            },
            {
                "feature": "geocode_confidence",
                "group": "quality",
                "available": "No",
                "missing_%": 12.3,
                "mutual_info": float("nan"),
                "perm_delta_rmse": 0.00,
                "mean_abs_shap": float("nan"),
                "selection_votes": 0,
                "in_selected_set": False,
            },
        ]
    )


def _tiny_shap_global() -> pd.DataFrame:
    """Cell 9.4 shap_global.csv: model, feature, mean_abs_shap."""
    return pd.DataFrame(
        [
            {"model": "xgb", "feature": "log_size_acres", "mean_abs_shap": 0.15},
            {"model": "xgb", "feature": "dist_to_nairobi_km", "mean_abs_shap": 0.12},
            {"model": "catboost", "feature": "log_size_acres", "mean_abs_shap": 0.18},
        ]
    )


def _tiny_feature_importance() -> pd.DataFrame:
    """Cell 9.4 feature_importance.csv: model, feature, importance, method."""
    return pd.DataFrame(
        [
            {"model": "xgb", "feature": "log_size_acres", "importance": 0.32, "method": "gain"},
            {
                "model": "catboost",
                "feature": "log_size_acres",
                "importance": 0.28,
                "method": "PredictionValuesChange",
            },
            {
                "model": "tabnet",
                "feature": "log_size_acres",
                "importance": 0.04,
                "method": "permutation (development set, 5 shuffles, seed 42)",
            },
        ]
    )


def _tiny_feature_labels() -> dict:
    """Cell 9.4 feature_labels.json structure."""
    return {
        "production_run": "Run A",
        "features": {
            "log_size_acres": {
                "label": "Log parcel size",
                "unit": "log(acres)",
                "description": "Natural logarithm of the parcel size in acres.",
                "source": "Notebook 1 Phase 2",
                "in_production_set": True,
                "available_at_prediction_time": "Yes",
            },
            "geocode_confidence": {
                "label": "Geocode confidence",
                "unit": "score",
                "description": "Confidence tag from the geocoding waterfall.",
                "source": "Notebook 1 Phase 3",
                "in_production_set": False,
                "available_at_prediction_time": "No",
            },
        },
        "note": "descriptions are taken from the notebooks' own text",
    }


def _tiny_listings_scored() -> pd.DataFrame:
    """Cell 9.6 columns — identifier columns (Cell 9.2 ID_COLUMNS) + size +
    listed/predicted/low/high per-acre + ratio + scored_by + verdict +
    data_quality_flag."""
    return pd.DataFrame(
        [
            {
                "listing_url": "https://example.com/1",
                "listing_no": "L001",
                "title": "1 acre in Karen",
                "location": "Karen, Nairobi",
                "county": "Nairobi",
                "prop_type": "Land",
                "latitude": -1.32,
                "longitude": 36.73,
                "price_ksh": 4_500_000.0,
                "size_acres": 1.0,
                "listed_price_per_acre_ksh": 4_500_000.0,
                "predicted_price_per_acre_ksh": 5_000_000.0,
                "low_price_per_acre_ksh": 3_350_000.0,
                "high_price_per_acre_ksh": 7_460_000.0,
                "listed_over_predicted": 0.90,
                "scored_by": "oof",
                "verdict": "underpriced",
                "data_quality_flag": False,
            },
            {
                "listing_url": "https://example.com/2",
                "listing_no": "L002",
                "title": "5 acres in Kiambu",
                "location": "Kiambu Town",
                "county": "Kiambu",
                "prop_type": "Land",
                "latitude": -1.03,
                "longitude": 36.83,
                "price_ksh": 14_000_000.0,
                "size_acres": 5.0,
                "listed_price_per_acre_ksh": 2_800_000.0,
                "predicted_price_per_acre_ksh": 2_500_000.0,
                "low_price_per_acre_ksh": 1_675_000.0,
                "high_price_per_acre_ksh": 3_730_000.0,
                "listed_over_predicted": 1.12,
                "scored_by": "test",
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_url": "https://example.com/3",
                "listing_no": "L003",
                "title": "0.5 acre in Nakuru",
                "location": "Nakuru Town",
                "county": "Nakuru",
                "prop_type": "Farm",
                "latitude": -0.30,
                "longitude": 36.07,
                "price_ksh": 8_000_000.0,
                "size_acres": 0.5,
                "listed_price_per_acre_ksh": 16_000_000.0,
                "predicted_price_per_acre_ksh": 6_500_000.0,
                "low_price_per_acre_ksh": 4_355_000.0,
                "high_price_per_acre_ksh": 9_700_000.0,
                "listed_over_predicted": 2.46,
                "scored_by": "oof",
                "verdict": "overpriced",
                "data_quality_flag": True,
            },
        ]
    )


def _tiny_manifest() -> dict:
    """Cell 9.7 manifest.json — minimal but with the config block the
    counties endpoint reads for MIN_COUNTY_N."""
    return {
        "created": "2025-01-15 10:00:00",
        "production_run": "Run A",
        "config": {"MIN_COUNTY_N": 10, "DEAL_LEVEL": 0.8},
        "ensemble_shap_coverage": {
            "tree_share_explained_by_shap": 0.85,
            "tabnet_share_not_covered": 0.15,
            "note": "weighted sum of member SHAP explains the tree share exactly",
        },
        "files": [],
    }


def _tiny_oof_predictions() -> pd.DataFrame:
    """Cell 9.2 oof_predictions columns — 2 dev rows."""
    return pd.DataFrame(
        [
            {
                "listing_url": "https://example.com/1",
                "listing_no": "L001",
                "title": "1 acre Karen",
                "location": "Karen",
                "county": "Nairobi",
                "prop_type": "Land",
                "latitude": -1.32,
                "longitude": 36.73,
                "price_ksh": 4_500_000.0,
                "y_true": 15.32,
                "pred_xgb": 15.28,
                "pred_catboost": 15.35,
                "pred_tabnet": 15.20,
                "pred_simple_average": 15.28,
                "pred_weighted_ensemble": 15.32,
                "fold": 0,
                "split": "dev",
            },
            {
                "listing_url": "https://example.com/2",
                "listing_no": "L002",
                "title": "5 acres Kiambu",
                "location": "Kiambu",
                "county": "Kiambu",
                "prop_type": "Land",
                "latitude": -1.03,
                "longitude": 36.83,
                "price_ksh": 14_000_000.0,
                "y_true": 14.85,
                "pred_xgb": 14.80,
                "pred_catboost": 14.90,
                "pred_tabnet": 14.75,
                "pred_simple_average": 14.82,
                "pred_weighted_ensemble": 14.85,
                "fold": 1,
                "split": "dev",
            },
        ]
    )


def _tiny_test_predictions() -> pd.DataFrame:
    """Cell 9.2 test_predictions columns — 1 test row."""
    return pd.DataFrame(
        [
            {
                "listing_url": "https://example.com/3",
                "listing_no": "L003",
                "title": "0.5 acre Nakuru",
                "location": "Nakuru",
                "county": "Nakuru",
                "prop_type": "Farm",
                "latitude": -0.30,
                "longitude": 36.07,
                "price_ksh": 8_000_000.0,
                "y_true": 16.68,
                "pred_xgb": 16.50,
                "pred_catboost": 16.70,
                "pred_tabnet": 16.40,
                "pred_simple_average": 16.53,
                "pred_weighted_ensemble": 16.60,
                "fold": -1,
                "split": "test",
            },
        ]
    )


def _all_tiny_exports() -> dict:
    """Every tiny fixture, keyed by file name — used to populate a full
    happy-path app_exports/ directory in one call."""
    return {
        "manifest.json": _tiny_manifest(),
        "metrics.json": _tiny_metrics_json(),
        "feature_labels.json": _tiny_feature_labels(),
        "county_summary.csv": _tiny_county_summary(),
        "metrics_table.csv": _tiny_metrics_table(),
        "feature_evaluation.csv": _tiny_feature_evaluation(),
        "shap_global.csv": _tiny_shap_global(),
        "feature_importance.csv": _tiny_feature_importance(),
        "listings_scored.parquet": _tiny_listings_scored(),
        "oof_predictions.parquet": _tiny_oof_predictions(),
        "test_predictions.parquet": _tiny_test_predictions(),
    }


# ----------------------------------------------------------------------
# Fixture: an app with all tiny exports present
# ----------------------------------------------------------------------


@pytest.fixture
def app_with_exports(app, tmp_path):
    """Populate the app's ARTIFACTS_DIR/app_exports/ with every tiny fixture
    and re-run the AppExportsRegistry load.

    The conftest's ``app`` fixture sets ARTIFACTS_DIR to tmp_path and starts
    the lifespan (which loads an empty app_exports registry).  We then write
    the fixtures and re-load the registry in-place.
    """
    _write_app_exports(tmp_path, _all_tiny_exports())
    from app.services.app_exports import AppExportsRegistry

    new_reg = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
    app.state.app_exports = new_reg
    yield app


# ----------------------------------------------------------------------
# /api/v1/counties/summary
# ----------------------------------------------------------------------


class TestCountySummary:
    def test_happy_path(self, app_with_exports, client):
        resp = client.get("/api/v1/counties/summary")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["n_counties"] == 3
        assert body["min_county_n"] == 10  # from manifest.config
        counties = {c["county"]: c for c in body["counties"]}
        assert counties["Nairobi"]["n_listings"] == 412
        assert counties["Nairobi"]["median_price_per_acre_ksh"] == 4_500_000.0
        assert counties["Marsabit"]["n_below_min_county_n"] is True
        assert counties["Nairobi"]["n_below_min_county_n"] is False

    def test_data_unavailable_when_missing(self, client):
        """When county_summary.csv is absent the endpoint returns 503
        DATA_UNAVAILABLE (not a 500)."""
        resp = client.get("/api/v1/counties/summary")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"
        assert "county_summary.csv" in body["error"]["details"]["file"]


# ----------------------------------------------------------------------
# /api/v1/model/metrics
# ----------------------------------------------------------------------


class TestModelMetrics:
    def test_happy_path(self, app_with_exports, client):
        resp = client.get("/api/v1/model/metrics")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["table"]["n_runs"] == 1
        assert len(body["table"]["rows"]) == 2  # xgb + weighted_ensemble
        # Production-run weighted_ensemble row carries interval coverage
        we = next(r for r in body["table"]["rows"] if r["model"] == "weighted_ensemble")
        assert we["interval_coverage_80"] == pytest.approx(0.81)
        assert we["interval_width_ratio_80"] == pytest.approx(2.23)
        assert we["trimmed_test_rows"] == 380
        # xgb row leaves them as null
        xgb = next(r for r in body["table"]["rows"] if r["model"] == "xgb")
        assert xgb["interval_coverage_80"] is None
        assert xgb["trimmed_test_rows"] is None
        # metrics.json echo
        assert body["metrics_json"]["production_run"] == "Run A"
        assert len(body["metrics_json"]["interval_coverage_weighted_ensemble"]) == 2

    def test_data_unavailable_when_metrics_table_missing(self, app, tmp_path, client):
        """Only metrics.json present, metrics_table.csv missing -> 503."""
        _write_app_exports(
            tmp_path,
            {
                "metrics.json": _tiny_metrics_json(),
                "manifest.json": _tiny_manifest(),
            },
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        resp = client.get("/api/v1/model/metrics")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"
        assert "metrics_table.csv" in body["error"]["details"]["file"]

    def test_data_unavailable_when_metrics_json_missing(self, app, tmp_path, client):
        """Only metrics_table.csv present, metrics.json missing -> 503."""
        _write_app_exports(
            tmp_path,
            {
                "metrics_table.csv": _tiny_metrics_table(),
                "manifest.json": _tiny_manifest(),
            },
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        resp = client.get("/api/v1/model/metrics")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"
        assert "metrics.json" in body["error"]["details"]["file"]


# ----------------------------------------------------------------------
# /api/v1/model/feature-evaluation
# ----------------------------------------------------------------------


class TestFeatureEvaluation:
    def test_happy_path(self, app_with_exports, client):
        resp = client.get("/api/v1/model/feature-evaluation")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["n_features"] == 3
        feats = {r["feature"]: r for r in body["rows"]}
        assert feats["log_size_acres"]["in_selected_set"] is True
        assert feats["geocode_confidence"]["in_selected_set"] is False
        assert feats["geocode_confidence"]["available"] == "No"
        # The alias "missing_%" mirrors the CSV column name exactly (Cell 3.8)
        assert feats["log_size_acres"]["missing_%"] == 0.0
        # NaN mutual_info coerced to null
        assert feats["geocode_confidence"]["mutual_info"] is None

    def test_data_unavailable_when_missing(self, client):
        resp = client.get("/api/v1/model/feature-evaluation")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"
        assert "feature_evaluation.csv" in body["error"]["details"]["file"]


# ----------------------------------------------------------------------
# /api/v1/model/explainability
# ----------------------------------------------------------------------


class TestExplainability:
    def test_happy_path(self, app_with_exports, client):
        resp = client.get("/api/v1/model/explainability")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["production_run"] == "Run A"
        assert len(body["shap_global"]) == 3
        assert len(body["feature_importance"]) == 3
        assert "log_size_acres" in body["feature_labels"]
        label = body["feature_labels"]["log_size_acres"]
        assert label["label"] == "Log parcel size"
        assert label["in_production_set"] is True
        # ensemble_shap_coverage straight from the manifest
        cov = body["ensemble_shap_coverage"]
        assert cov["tree_share_explained_by_shap"] == pytest.approx(0.85)
        assert cov["tabnet_share_not_covered"] == pytest.approx(0.15)

    def test_data_unavailable_when_shap_missing(self, app, tmp_path, client):
        """All explainability files except shap_global.csv -> 503 with the
        specific missing file named."""
        _write_app_exports(
            tmp_path,
            {
                "feature_importance.csv": _tiny_feature_importance(),
                "feature_labels.json": _tiny_feature_labels(),
                "manifest.json": _tiny_manifest(),
            },
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        resp = client.get("/api/v1/model/explainability")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"
        assert "shap_global.csv" in body["error"]["details"]["file"]


# ----------------------------------------------------------------------
# /api/v1/listings/scored
# ----------------------------------------------------------------------


class TestListingsScored:
    def test_happy_path_default_pagination(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # 3 rows in the fixture, default page_size=50 -> all on page 1
        assert body["pagination"]["total_rows"] == 3
        assert body["pagination"]["page"] == 1
        assert body["pagination"]["page_size"] == 50
        assert body["pagination"]["total_pages"] == 1
        # Default sort = listed_over_predicted ascending -> underpriced first
        assert body["listings"][0]["verdict"] == "underpriced"
        assert body["listings"][0]["listed_over_predicted"] == pytest.approx(0.90)
        # Filters echoed back empty
        assert body["pagination"]["filters"] == {}

    def test_pagination(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored?page=1&page_size=2")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pagination"]["page_size"] == 2
        assert body["pagination"]["total_pages"] == 2
        assert len(body["listings"]) == 2
        # Second page returns the remaining row
        resp2 = client.get("/api/v1/listings/scored?page=2&page_size=2")
        body2 = resp2.json()
        assert len(body2["listings"]) == 1

    def test_filter_by_county_substring_case_insensitive(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored?county=NAIR")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pagination"]["total_rows"] == 1
        assert body["listings"][0]["county"] == "Nairobi"
        assert body["pagination"]["filters"]["county"] == "NAIR"

    def test_filter_by_verdict(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored?verdict=underpriced")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pagination"]["total_rows"] == 1
        assert body["listings"][0]["verdict"] == "underpriced"

    def test_filter_by_prop_type(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored?prop_type=farm")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pagination"]["total_rows"] == 1
        assert body["listings"][0]["prop_type"] == "Farm"

    def test_filter_by_scored_by(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored?scored_by=oof")
        assert resp.status_code == 200
        body = resp.json()
        # 2 of 3 fixture rows are scored_by=oof
        assert body["pagination"]["total_rows"] == 2
        assert all(li["scored_by"] == "oof" for li in body["listings"])

    def test_filter_by_data_quality_flag(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored?data_quality_flag=true")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pagination"]["total_rows"] == 1
        assert body["listings"][0]["data_quality_flag"] is True
        assert body["listings"][0]["listing_no"] == "L003"

    def test_combined_filters(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored?verdict=fair&scored_by=test")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pagination"]["total_rows"] == 1
        assert body["listings"][0]["listing_no"] == "L002"

    def test_invalid_verdict_returns_422(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored?verdict=bogus")
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert "bogus" in body["error"]["message"]

    def test_invalid_sort_returns_422(self, app_with_exports, client):
        resp = client.get("/api/v1/listings/scored?sort=price")
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_page_size_capped_at_200(self, app_with_exports, client):
        # page_size > 200 should be rejected by the Query constraint
        resp = client.get("/api/v1/listings/scored?page_size=201")
        assert resp.status_code == 422

    def test_data_unavailable_when_missing(self, client):
        resp = client.get("/api/v1/listings/scored")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"
        assert "listings_scored.parquet" in body["error"]["details"]["file"]


# ----------------------------------------------------------------------
# AppExportsRegistry unit tests
# ----------------------------------------------------------------------


class TestAppExportsRegistry:
    def test_load_all_files(self, tmp_path):
        _write_app_exports(tmp_path, _all_tiny_exports())
        from app.services.app_exports import AppExportsRegistry

        reg = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        assert reg.manifest is not None
        assert reg.metrics_json is not None
        assert reg.feature_labels_json is not None
        assert reg.county_summary_df is not None
        assert reg.metrics_table_df is not None
        assert reg.feature_evaluation_df is not None
        assert reg.shap_global_df is not None
        assert reg.feature_importance_df is not None
        assert reg.listings_scored_df is not None
        assert reg.missing_files == []
        assert len(reg.loaded_files) == 11

    def test_load_with_no_files(self, tmp_path):
        from app.services.app_exports import AppExportsRegistry

        reg = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        assert reg.manifest is None
        assert reg.listings_scored_df is None
        assert len(reg.missing_files) == 11
        assert reg.loaded_files == []

    def test_load_with_partial_files(self, tmp_path):
        """Some files present, some missing — the present ones load fine
        and the missing ones are recorded per-file."""
        _write_app_exports(
            tmp_path,
            {
                "county_summary.csv": _tiny_county_summary(),
                "manifest.json": _tiny_manifest(),
            },
        )
        from app.services.app_exports import AppExportsRegistry

        reg = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        assert reg.county_summary_df is not None
        assert reg.manifest is not None
        assert reg.metrics_json is None  # missing
        assert reg.listings_scored_df is None  # missing
        assert "metrics.json" in reg.missing_files
        assert "listings_scored.parquet" in reg.missing_files
        assert "county_summary.csv" not in reg.missing_files

    def test_require_raises_app_error_when_missing(self, tmp_path):
        from app.core.exceptions import AppError
        from app.services.app_exports import AppExportsRegistry

        reg = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with pytest.raises(AppError) as exc_info:
            reg.require("county_summary_df", "county_summary.csv")
        assert exc_info.value.code == "DATA_UNAVAILABLE"
        assert exc_info.value.status_code == 503

    def test_require_returns_value_when_loaded(self, tmp_path):
        _write_app_exports(tmp_path, {"county_summary.csv": _tiny_county_summary()})
        from app.services.app_exports import AppExportsRegistry

        reg = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        df = reg.require("county_summary_df", "county_summary.csv")
        assert df is not None
        assert len(df) == 3
