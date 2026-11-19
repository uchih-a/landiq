"""Unit tests for the prediction endpoint and PredictionService.

These tests run in CI **without the real model files**: they build a tiny
in-memory stub registry + feature pipeline that exercise the math of
PredictionService (Cell 8.3 weighted-ensemble + Cell 9.1 multiplicative
conformal interval) end-to-end, then verify the FastAPI layer's
request/response shape, its 503 ``MODEL_NOT_LOADED`` behaviour in degraded
mode, and its 422 validation behaviour for malformed bodies.

A separate parity check (``scripts/parity_check.py``) compares
PredictionService output against the stored ``test_predictions.parquet``
when the real artefacts are present — that path is not exercised here.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Ensure src/ and backend/ are importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

from landval.features.pipeline import FeatureResult  # noqa: E402
from landval.modelling.predict import PredictionService  # noqa: E402
from landval.modelling.preprocessing import PipelinePreprocessor  # noqa: E402

# ----------------------------------------------------------------------
# Stub registry: tiny in-memory ensemble that returns a fixed log prediction
# per member.  The weights are renormalised like the real registry does.
# ----------------------------------------------------------------------

_FIXED_FEATURES = [
    {"name": "log_size_acres", "type": "numeric"},
    {"name": "dist_to_nairobi_km", "type": "numeric"},
    {"name": "infrastructure_score", "type": "numeric"},
    {"name": "prop_type", "type": "categorical"},
    {"name": "county", "type": "categorical"},
]


class _StubModel:
    """Returns a fixed log prediction regardless of input.

    The weighted ensemble of two members with weights [0.4, 0.6] and
    member logs [13.0, 14.0] is 0.4*13 + 0.6*14 = 13.6 — exp(13.6) is
    ~808,000 KSh/acre, which is in the realistic range for Kenyan land.
    """

    def __init__(self, log_pred: float):
        self.log_pred = float(log_pred)

    def predict(self, _frame):
        return np.asarray([self.log_pred], dtype=float)


class _StubRegistry:
    """Quack like ``ModelRegistry`` without touching disk."""

    loaded = True
    kept_members = ["xgb", "catboost"]
    kept_weights = {"xgb": 0.4, "catboost": 0.6}
    dropped_models: dict[str, dict] = {}
    feature_list = _FIXED_FEATURES
    feature_names = [f["name"] for f in _FIXED_FEATURES]
    categorical_features = [f["name"] for f in _FIXED_FEATURES if f["type"] == "categorical"]
    numeric_features = [f["name"] for f in _FIXED_FEATURES if f["type"] == "numeric"]
    imputation_values: dict[str, float] = {}
    category_levels: dict[str, list[str]] = {}
    tabnet_target: dict[str, float] = {}
    n_calibration_rows = 100
    conformal_q_by_level = {0.5: 0.20, 0.8: 0.40, 0.9: 0.55}
    coverage_rules = {
        "COVERAGE_MIN_COUNTY_N": 10,
        "COVERAGE_MIN_NEARBY_N": 5,
        "COVERAGE_RADIUS_KM": 50,
    }
    error_by_support: list[dict] = []
    explain_spec_present = True
    explain_spec_path = ""
    missing_files: list[str] = []
    load_time_s = 0.001
    memory_mb = 0.1

    def __init__(self):
        self.models = {
            "xgb": _StubModel(13.0),
            "catboost": _StubModel(14.0),
        }
        # Fit a real PipelinePreprocessor on a tiny frame so transform_xgb /
        # transform_catboost produce the expected column views.  This also
        # exercises the verbatim Cell 3.2 code path.
        df = pd.DataFrame(
            {
                "log_size_acres": [np.log(1.0), np.log(2.0), np.log(5.0)],
                "dist_to_nairobi_km": [0.0, 50.0, 200.0],
                "infrastructure_score": [0.0, 50.0, 100.0],
                "prop_type": ["Land", "Land", "Farm"],
                "county": ["Nairobi", "Kiambu", "Nakuru"],
            }
        )
        self.preprocessor = PipelinePreprocessor(
            feature_cols=self.feature_names,
            categorical_cols=self.categorical_features,
        ).fit(df)

    @property
    def model_order(self) -> list[str]:
        return self.kept_members

    @property
    def weights_array(self):
        return np.asarray([self.kept_weights[k] for k in self.model_order], dtype=float)

    def conformal_q(self, level: float) -> float | None:
        return self.conformal_q_by_level.get(float(level))

    # ---- New in this phase: SHAP-coverage helpers (mirror ModelRegistry) ----
    @property
    def tree_members_loaded(self) -> list[str]:
        return [m for m in self.kept_members if m in ("xgb", "catboost")]

    def recomputed_shap_coverage(self) -> dict:
        tree_share = sum(w for m, w in self.kept_weights.items() if m in ("xgb", "catboost"))
        tabnet_share = sum(w for m, w in self.kept_weights.items() if m == "tabnet")
        return {
            "tree_share_explained_by_shap": round(tree_share, 6),
            "tabnet_share_not_covered": round(tabnet_share, 6),
            "explained_members": self.tree_members_loaded,
            "unexplained_members": [m for m in self.kept_members if m not in ("xgb", "catboost")],
            "note": "stub",
        }


# ----------------------------------------------------------------------
# Stub feature pipeline: returns a fixed FeatureResult so the tests do not
# need the spatial GPKG files.  The county is parameterisable so we can
# exercise the "point outside Kenya" and "low-support county" cases.
# ----------------------------------------------------------------------


class _StubFeaturePipeline:
    """Returns a fixed FeatureResult for any input point."""

    def __init__(self, county: str | None = "Nairobi"):
        self._county = county

    def compute_features(self, lat, lon, size_acres, prop_type="Land", parcel_features=None):
        import math

        features = {
            "log_size_acres": math.log(size_acres) if size_acres > 0 else float("nan"),
            "dist_to_nairobi_km": 0.0,
            "infrastructure_score": 50.0,
            "prop_type": prop_type,
            "county": self._county,
        }
        diagnostics = {
            "county": self._county,
            "spatial_indexes_loaded": {
                "counties": True,
                "amenities": False,
                "accessibility": False,
            },
        }
        return FeatureResult(features=features, county=self._county, diagnostics=diagnostics)


# ----------------------------------------------------------------------
# Fixtures
# ----------------------------------------------------------------------


@pytest.fixture
def stub_registry():
    return _StubRegistry()


@pytest.fixture
def stub_service(stub_registry, tmp_path):
    return PredictionService(
        registry=stub_registry,
        feature_pipeline=_StubFeaturePipeline(),
        artifacts_dir=str(tmp_path),
    )


@pytest.fixture
def stub_service_low_support(stub_registry, tmp_path):
    """A service whose feature pipeline returns a county with zero support."""
    return PredictionService(
        registry=stub_registry,
        feature_pipeline=_StubFeaturePipeline(county="Marsabit"),  # not in support table
        artifacts_dir=str(tmp_path),
    )


# ----------------------------------------------------------------------
# PredictionService math tests (Cell 8.3 + Cell 9.1)
# ----------------------------------------------------------------------


class TestPredictionServiceMath:
    def test_weighted_ensemble_matches_cell_8_3(self, stub_service):
        """log_ens = sum(w[i] * log_preds[k] for i, k in enumerate(model_order)).

        With stub weights [0.4, 0.6] and member logs [13.0, 14.0] the
        expected log_ens is 0.4*13 + 0.6*14 = 13.6 — verbatim Cell 8.3.
        """
        result = stub_service.predict(
            lat=-1.2921,
            lon=36.8219,
            size_acres=1.5,
            level=0.8,
        )
        assert result.log_ensemble == pytest.approx(13.6, abs=1e-9)
        assert result.price_per_acre_ksh == pytest.approx(np.exp(13.6), rel=1e-9)

    def test_conformal_interval_matches_cell_9_1(self, stub_service):
        """exp(log_ens +/- q) — multiplicative on the KSh scale."""
        result = stub_service.predict(
            lat=-1.2921,
            lon=36.8219,
            size_acres=1.0,
            level=0.8,
        )
        q = 0.40  # stub value
        assert result.conformal_q == pytest.approx(q, abs=1e-9)
        assert result.price_per_acre_low_ksh == pytest.approx(np.exp(13.6 - q), rel=1e-9)
        assert result.price_per_acre_high_ksh == pytest.approx(np.exp(13.6 + q), rel=1e-9)
        # high/low ratio = exp(2q) for every listing — Cell 9.1's invariant
        ratio = result.price_per_acre_high_ksh / result.price_per_acre_low_ksh
        assert ratio == pytest.approx(np.exp(2 * q), rel=1e-9)

    def test_total_price_multiplies_by_size(self, stub_service):
        """Cell 8.3: total_price_ksh = price_per_acre_ksh * size_acres."""
        result = stub_service.predict(
            lat=-1.2921,
            lon=36.8219,
            size_acres=2.5,
            level=0.8,
        )
        assert result.total_price_ksh == pytest.approx(result.price_per_acre_ksh * 2.5, rel=1e-9)
        assert result.total_price_low_ksh == pytest.approx(
            result.price_per_acre_low_ksh * 2.5, rel=1e-9
        )
        assert result.total_price_high_ksh == pytest.approx(
            result.price_per_acre_high_ksh * 2.5, rel=1e-9
        )

    def test_confidence_level_0_8_uses_exported_q(self, stub_service):
        result = stub_service.predict(
            lat=-1.2921,
            lon=36.8219,
            size_acres=1.0,
            level=0.8,
        )
        assert result.confidence_level == 0.8
        assert result.conformal_q == pytest.approx(0.40, abs=1e-9)

    def test_confidence_level_0_5_uses_exported_q(self, stub_service):
        result = stub_service.predict(
            lat=-1.2921,
            lon=36.8219,
            size_acres=1.0,
            level=0.5,
        )
        assert result.conformal_q == pytest.approx(0.20, abs=1e-9)

    def test_invalid_level_raises(self, stub_service):
        with pytest.raises(ValueError, match="strictly between 0 and 1"):
            stub_service.predict(lat=-1.2921, lon=36.8219, size_acres=1.0, level=1.5)
        with pytest.raises(ValueError, match="strictly between 0 and 1"):
            stub_service.predict(lat=-1.2921, lon=36.8219, size_acres=1.0, level=0.0)


# ----------------------------------------------------------------------
# Coverage warning tests (Cell 9.9)
# ----------------------------------------------------------------------


class TestCoverageWarning:
    def test_low_support_when_county_not_in_support_table(self, stub_service_low_support, tmp_path):
        """When the support table (oof + test parquets) is absent, every
        prediction is flagged low-support — Cell 9.9's rule cannot be
        checked, so the conservative answer is "warn"."""
        result = stub_service_low_support.predict(
            lat=2.5,
            lon=38.0,
            size_acres=1.0,
            level=0.8,
        )
        assert result.coverage.is_low_support is True
        assert "support table not loaded" in result.coverage.reason

    def test_low_support_when_county_below_threshold(self, stub_registry, tmp_path):
        """Build a tiny support parquet with a county below the threshold
        (10 listings) and verify the warning fires for that county but
        not for a well-supported one."""
        # Build support parquet: 5 Nairobi rows + 0 Marsabit rows
        support = pd.DataFrame(
            {
                "county": ["Nairobi"] * 5,
                "latitude": [-1.29] * 5,
                "longitude": [36.82] * 5,
            }
        )
        app_exports = tmp_path / "app_exports"
        app_exports.mkdir()
        support.to_parquet(app_exports / "oof_predictions.parquet", index=False)

        svc = PredictionService(
            registry=stub_registry,
            feature_pipeline=_StubFeaturePipeline(county="Marsabit"),
            artifacts_dir=str(tmp_path),
        )
        result = svc.predict(lat=2.5, lon=38.0, size_acres=1.0, level=0.8)
        assert result.coverage.county_listings == 0
        assert result.coverage.is_low_support is True
        assert "county listings (0)" in result.coverage.reason

    def test_well_supported_county_no_warning(self, stub_registry, tmp_path):
        """A county with >= MIN_COUNTY_N listings AND >= MIN_NEARBY_N
        listings within 50 km clears the warning."""
        rows = []
        # 20 Nairobi listings clustered near (-1.29, 36.82)
        for i in range(20):
            rows.append(
                {"county": "Nairobi", "latitude": -1.29 + 0.001 * i, "longitude": 36.82 + 0.001 * i}
            )
        support = pd.DataFrame(rows)
        app_exports = tmp_path / "app_exports"
        app_exports.mkdir()
        support.to_parquet(app_exports / "oof_predictions.parquet", index=False)

        svc = PredictionService(
            registry=stub_registry,
            feature_pipeline=_StubFeaturePipeline(county="Nairobi"),
            artifacts_dir=str(tmp_path),
        )
        result = svc.predict(lat=-1.2921, lon=36.8219, size_acres=1.0, level=0.8)
        assert result.coverage.county_listings == 20
        assert result.coverage.nearby_listings >= 5
        assert result.coverage.is_low_support is False
        assert result.coverage.reason == ""


# ----------------------------------------------------------------------
# PipelinePreprocessor tests (verbatim Cell 3.2 round-trip)
# ----------------------------------------------------------------------


class TestPipelinePreprocessor:
    def test_to_dict_from_dict_round_trip(self):
        df = pd.DataFrame(
            {
                "log_size_acres": [
                    np.log(1.0),
                    np.log(2.0),
                    np.log(5.0),
                    np.log(3.0),
                    np.log(4.0),
                    np.log(6.0),
                ],
                "county": ["Nairobi", "Kiambu", "Nakuru", "Nairobi", "Kiambu", "Nakuru"],
            }
        )
        prep = PipelinePreprocessor(
            feature_cols=["log_size_acres", "county"],
            categorical_cols=["county"],
        ).fit(df)
        d = prep.to_dict()
        prep2 = PipelinePreprocessor.from_dict(d)
        # The reconstructed preprocessor must produce identical transforms
        x1 = prep.transform_xgb(df)
        x2 = prep2.transform_xgb(df)
        pd.testing.assert_frame_equal(x1, x2)

    def test_rare_categories_grouped_to_other(self):
        # 6 rows; "Marsabit" appears once (< MIN_CATEGORY_ROWS=5)
        df = pd.DataFrame(
            {
                "x": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
                "county": ["Nairobi", "Nairobi", "Nairobi", "Nairobi", "Nairobi", "Marsabit"],
            }
        )
        prep = PipelinePreprocessor(["x", "county"], ["county"]).fit(df)
        assert "Marsabit" not in prep.levels_["county"]
        assert "Other" in prep.levels_["county"]
        # Transform maps unseen "Marsabit" to "Other"
        out = prep.transform_catboost(df)
        assert (out["county"] == "Other").sum() == 1

    def test_numeric_nans_kept_for_xgb_catboost(self):
        df = pd.DataFrame(
            {
                "x": [1.0, np.nan, 3.0, 4.0, 5.0, 6.0],
                "county": ["Nairobi"] * 6,
            }
        )
        prep = PipelinePreprocessor(["x", "county"], ["county"]).fit(df)
        out_xgb = prep.transform_xgb(df)
        assert out_xgb["x"].isna().sum() == 1  # NaN kept for native handling
        out_cat = prep.transform_catboost(df)
        assert out_cat["x"].isna().sum() == 1

    def test_tabnet_imputes_and_standardises(self):
        df = pd.DataFrame(
            {
                "x": [1.0, np.nan, 3.0, 4.0, 5.0, 6.0],
                "county": ["Nairobi"] * 6,
            }
        )
        prep = PipelinePreprocessor(["x", "county"], ["county"]).fit(df)
        out_tab = prep.transform_tabnet(df)
        # Numeric column should have no NaNs (imputed)
        assert out_tab["x"].isna().sum() == 0
        # Missing-indicator column added
        assert "x_was_missing" in out_tab.columns
        # The missing row's indicator is 1
        assert int(out_tab["x_was_missing"].iloc[1]) == 1


# ----------------------------------------------------------------------
# API endpoint tests (with and without the model loaded)
# ----------------------------------------------------------------------


class TestPredictEndpoint:
    """Test POST /api/v1/predict through the FastAPI layer."""

    def test_503_when_model_not_loaded(self, client):
        """In degraded mode (no artefacts in tmp_path), the endpoint
        returns 503 MODEL_NOT_LOADED with the standard error body."""
        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": -1.2921,
                "lon": 36.8219,
                "size_acres": 1.5,
                "prop_type": "Land",
                "parcel_features": {"borehole": True},
                "confidence_level": 0.8,
            },
        )
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "MODEL_NOT_LOADED"
        assert "details" in body["error"]

    def test_422_when_lat_out_of_range(self, client):
        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": 95.0,  # out of range
                "lon": 36.82,
                "size_acres": 1.5,
            },
        )
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_422_when_size_nonpositive(self, client):
        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": -1.29,
                "lon": 36.82,
                "size_acres": 0,
            },
        )
        assert resp.status_code == 422

    def test_422_when_unknown_parcel_key(self, client):
        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": -1.29,
                "lon": 36.82,
                "size_acres": 1.0,
                "parcel_features": {"unknown_item": True},
            },
        )
        assert resp.status_code == 422
        body = resp.json()
        assert "unknown parcel_features keys" in str(body["error"]["details"])

    def test_422_when_confidence_level_invalid(self, client):
        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": -1.29,
                "lon": 36.82,
                "size_acres": 1.0,
                "confidence_level": 1.5,  # > 1
            },
        )
        assert resp.status_code == 422

    def test_200_with_injected_stub_service(self, app, client):
        """Inject a stub PredictionService into app.state and verify the
        response shape end-to-end through the router."""
        from app.api.v1.routers.predict import router  # noqa: F401  # ensure loaded

        # Build the stub service in-place
        registry = _StubRegistry()
        svc = PredictionService(
            registry=registry,
            feature_pipeline=_StubFeaturePipeline(county="Nairobi"),
            artifacts_dir="/tmp/unused",  # stub support table is empty -> low-support
        )
        app.state.model_registry = registry
        app.state.prediction_service = svc

        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": -1.2921,
                "lon": 36.8219,
                "size_acres": 2.5,
                "prop_type": "Land",
                "parcel_features": {
                    "borehole": True,
                    "piped_water": False,
                    "river_water": "not_sure",
                    "water_tank": False,
                    "grid_electric": True,
                    "solar_electric": False,
                    "full_fence": True,
                    "partial_fence": False,
                    "structures": False,
                    "internal_road": "not_sure",
                },
                "confidence_level": 0.8,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Cell 8.3 math: log_ens = 0.4*13 + 0.6*14 = 13.6 -> exp(13.6)
        import math

        expected_ppa = math.exp(13.6)
        assert body["price_per_acre_ksh"] == pytest.approx(expected_ppa, rel=1e-6)
        # Cell 9.1: q = 0.40 (stub)
        expected_low = math.exp(13.6 - 0.40)
        expected_high = math.exp(13.6 + 0.40)
        assert body["price_per_acre_low_ksh"] == pytest.approx(expected_low, rel=1e-6)
        assert body["price_per_acre_high_ksh"] == pytest.approx(expected_high, rel=1e-6)
        # Total = per-acre * 2.5
        assert body["total_price_ksh"] == pytest.approx(expected_ppa * 2.5, rel=1e-6)
        # County propagated from the stub feature pipeline
        assert body["county"] == "Nairobi"
        # Coverage warning: stub support table is empty -> low-support
        assert body["coverage"]["is_low_support"] is True
        # Ensemble members reported in the response
        assert body["ensemble_members"] == {"xgb": 0.4, "catboost": 0.6}

    def test_parcel_features_not_sure_coerces_to_none(self, app, client):
        """The request schema converts 'not_sure' to None (and true/false to
        1/0) before handing the dict to the feature pipeline.  Verify via
        the stub service."""
        registry = _StubRegistry()
        captured: dict = {}

        class _CapturingPipeline(_StubFeaturePipeline):
            def compute_features(
                self, lat, lon, size_acres, prop_type="Land", parcel_features=None
            ):
                captured["parcel_features"] = parcel_features
                return super().compute_features(lat, lon, size_acres, prop_type, parcel_features)

        svc = PredictionService(
            registry=registry,
            feature_pipeline=_CapturingPipeline(),
            artifacts_dir="/tmp/unused",
        )
        app.state.model_registry = registry
        app.state.prediction_service = svc

        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": -1.29,
                "lon": 36.82,
                "size_acres": 1.0,
                "parcel_features": {
                    "borehole": True,
                    "piped_water": False,
                    "river_water": "not_sure",
                },
                "confidence_level": 0.8,
            },
        )
        assert resp.status_code == 200, resp.text
        # B1 received 1 / 0 / None — the API conversion is correct
        assert captured["parcel_features"]["borehole"] == 1
        assert captured["parcel_features"]["piped_water"] == 0
        assert captured["parcel_features"]["river_water"] is None
        # Untyped items default to None (the API fills all ten keys)
        assert captured["parcel_features"]["structures"] is None


# ----------------------------------------------------------------------
# Outside-Kenya test (point validation)
# ----------------------------------------------------------------------


class TestPointOutsideKenya:
    def test_point_outside_kenya_county_none(self, stub_registry, tmp_path):
        """A point well outside Kenya should land in no county — the
        stub pipeline returns county=None, which the coverage warning
        reads as zero county listings -> low-support."""
        svc = PredictionService(
            registry=stub_registry,
            feature_pipeline=_StubFeaturePipeline(county=None),
            artifacts_dir=str(tmp_path),
        )
        result = svc.predict(lat=8.0, lon=30.0, size_acres=1.0, level=0.8)
        assert result.county is None
        assert result.coverage.is_low_support is True
        # When no support parquet is present the reason is "support table not
        # loaded"; when one is present (TestCoverageWarning.test_low_support_*)
        # the reason names the below-threshold count.  Either way the warning
        # fires, which is the conservative correct behaviour.
        assert result.coverage.reason != ""


# ----------------------------------------------------------------------
# Parity check script (skip when artefacts absent)
# ----------------------------------------------------------------------


class TestParityCheckScript:
    def test_skip_when_artifacts_absent(self, tmp_path):
        """When the artefacts are not present, parity_check.run_parity_check
        must report 'artefacts not loaded — parity deferred' and exit 2,
        not fail the CI run."""
        from scripts.parity_check import run_parity_check

        ok, report = run_parity_check(artifacts_dir=str(tmp_path))
        assert ok is False
        assert "deferred" in report.get("cause", "")


# ----------------------------------------------------------------------
# Live SHAP explanation tests (Cell 9.4 + Cell 9.10 explain_spec.md rule)
# ----------------------------------------------------------------------


# Stub TreeExplainer: returns fixed SHAP values + base value per member.
# Shap's real TreeExplainer needs a fitted tree model; we avoid that in CI
# by monkeypatching ``shap.TreeExplainer`` to return one of these.
class _StubExplainer:
    """Mimics ``shap.TreeExplainer``: returns fixed shap_values + base."""

    def __init__(self, shap_values_array: list[float], base_value: float):
        self._sv = np.asarray(shap_values_array, dtype=float)
        # expected_value is a numpy array in real shap (length 1 for regression).
        self.expected_value = np.asarray([base_value], dtype=float)

    def shap_values(self, _X):
        # Real shap returns shape (n_rows, n_features) for tree models.
        return self._sv.reshape(1, -1)


class TestLiveExplanationService:
    """Verify the combined-SHAP math + the explain_spec.md money-effect rule."""

    def test_combined_shap_uses_renormalised_weights(self, stub_registry, monkeypatch):
        """combined_s_f = w_xgb * s_xgb_f + w_cat * s_cat_f  (Cell 9.4)
        combined_base = w_xgb * base_xgb + w_cat * base_cat"""
        import shap

        # Per-member SHAP values for the 5-feature stub feature list:
        # [log_size_acres, dist_to_nairobi_km, infrastructure_score, prop_type, county]
        xgb_sv = [0.10, -0.05, 0.20, 0.0, 0.0]
        cat_sv = [0.15, -0.10, 0.18, 0.0, 0.0]
        xgb_base = 13.0
        cat_base = 14.0

        # Stub shap.TreeExplainer returns a different explainer per member key.
        # We can't tell which member from the model alone, so we key on the
        # model object's log_pred attribute (set by _StubModel).
        def fake_tree_explainer(model, **_kwargs):
            if model.log_pred == 13.0:  # xgb
                return _StubExplainer(xgb_sv, xgb_base)
            if model.log_pred == 14.0:  # catboost
                return _StubExplainer(cat_sv, cat_base)
            raise AssertionError(f"unexpected model: {model.log_pred}")

        monkeypatch.setattr(shap, "TreeExplainer", fake_tree_explainer)

        from landval.modelling.explain import LiveExplanationService

        # Feature labels for the stub feature list
        labels = {
            "features": {
                "log_size_acres": {"label": "Log parcel size", "unit": "log(acres)"},
                "dist_to_nairobi_km": {"label": "Distance to Nairobi", "unit": "km"},
                "infrastructure_score": {"label": "Infrastructure score", "unit": "0-100"},
                "prop_type": {"label": "Property type", "unit": "category"},
                "county": {"label": "County", "unit": "category"},
            }
        }

        svc = LiveExplanationService(
            registry=stub_registry,
            feature_labels_json=labels,
            top_n=10,
        )

        # Build the same prepared frame PredictionService would produce
        feat = _StubFeaturePipeline().compute_features(
            lat=-1.29, lon=36.82, size_acres=1.5, prop_type="Land"
        )
        feat.features["size_acres"] = 1.5
        # Use PredictionService's frame prep via a quick instance
        ps = PredictionService(
            registry=stub_registry,
            feature_pipeline=_StubFeaturePipeline(),
            artifacts_dir="/tmp/unused",
        )
        frame = ps._prepare_input_frame(dict(feat.features), size_acres=1.5)

        result = svc.explain(frame)

        # Combined SHAP per feature: 0.4 * xgb + 0.6 * cat
        expected_combined = [0.4 * x + 0.6 * c for x, c in zip(xgb_sv, cat_sv, strict=False)]
        # combined_base = 0.4 * 13 + 0.6 * 14 = 13.6
        assert result.combined_base_value == pytest.approx(13.6, abs=1e-6)
        # exp(13.6) is the typical price
        import math

        assert result.typical_price_per_acre_ksh == pytest.approx(math.exp(13.6), rel=1e-6)
        # Drivers sorted by |shap_value| descending
        abs_expected = sorted(
            range(len(expected_combined)), key=lambda i: abs(expected_combined[i]), reverse=True
        )
        actual_order = [d.feature for d in result.drivers]
        expected_order = [stub_registry.feature_names[i] for i in abs_expected]
        assert actual_order == expected_order
        # Spot-check one feature's effect
        log_size_idx = stub_registry.feature_names.index("log_size_acres")
        log_size_driver = next(d for d in result.drivers if d.feature == "log_size_acres")
        combined_log_size = expected_combined[log_size_idx]
        assert log_size_driver.shap_value == pytest.approx(combined_log_size, abs=1e-9)
        # effect(f) = exp(s_f) - 1  (Cell 9.10 explain_spec.md)
        expected_effect_pct = (math.exp(combined_log_size) - 1) * 100
        assert log_size_driver.effect_pct == pytest.approx(expected_effect_pct, rel=1e-6)
        # Direction
        assert log_size_driver.direction == "price-increasing"  # combined > 0
        # Labels pulled from feature_labels.json
        assert log_size_driver.label == "Log parcel size"
        # Shares: tree_share = 0.4 + 0.6 = 1.0; tabnet_share = 0.0
        assert result.tree_share_explained_by_shap == pytest.approx(1.0, abs=1e-6)
        assert result.tabnet_share_not_covered == pytest.approx(0.0, abs=1e-6)
        assert result.explained_members == ["xgb", "catboost"]
        assert result.unexplained_members == []
        # Latency is recorded
        assert result.latency_ms >= 0.0

    def test_tabnet_share_reported_when_tabnet_loaded(self, monkeypatch):
        """When TabNet is loaded alongside tree members, the tabnet share is
        its renormalised weight and tree_share = 1 - tabnet_share."""
        import shap

        # Stub registry with xgb (0.3) + catboost (0.4) + tabnet (0.3)
        # tree_share = 0.3 + 0.4 = 0.7; tabnet_share = 0.3
        class _RegWithTabnet(_StubRegistry):
            kept_members = ["xgb", "catboost", "tabnet"]
            kept_weights = {"xgb": 0.3, "catboost": 0.4, "tabnet": 0.3}

            def __init__(self):
                super().__init__()
                # Add a placeholder tabnet model
                self.models["tabnet"] = _StubModel(13.5)

        reg = _RegWithTabnet()

        monkeypatch.setattr(
            shap,
            "TreeExplainer",
            lambda model, **_kw: (
                _StubExplainer([0.10, -0.05, 0.20, 0.0, 0.0], 13.0)
                if model.log_pred == 13.0
                else _StubExplainer([0.15, -0.10, 0.18, 0.0, 0.0], 14.0)
            ),
        )

        from landval.modelling.explain import LiveExplanationService

        svc = LiveExplanationService(registry=reg, feature_labels_json={"features": {}}, top_n=10)
        feat = _StubFeaturePipeline().compute_features(lat=-1.29, lon=36.82, size_acres=1.0)
        feat.features["size_acres"] = 1.0
        ps = PredictionService(
            registry=reg, feature_pipeline=_StubFeaturePipeline(), artifacts_dir="/tmp/unused"
        )
        frame = ps._prepare_input_frame(dict(feat.features), size_acres=1.0)
        result = svc.explain(frame)

        assert result.tree_share_explained_by_shap == pytest.approx(0.7, abs=1e-6)
        assert result.tabnet_share_not_covered == pytest.approx(0.3, abs=1e-6)
        assert "tabnet" in result.unexplained_members
        assert "xgb" in result.explained_members
        assert "catboost" in result.explained_members

    def test_explain_spec_md_rule_exactly(self, stub_registry, monkeypatch):
        """effect(f) = exp(s_f) - 1 (Cell 9.10 explain_spec.md) — verify
        for a known positive and negative SHAP value."""
        import shap

        # Set per-member SHAPs so the combined values are clean numbers:
        # target combined = [+0.10, -0.69, 0.0, 0.0, 0.0]
        # 0.4 * xgb + 0.6 * cat = 0.10 -> xgb=0.25, cat=0.0 (0.4*0.25 + 0.6*0 = 0.10)
        # 0.4 * xgb + 0.6 * cat = -0.69 -> xgb=-0.45, cat=-0.85 (0.4*-0.45 + 0.6*-0.85 = -0.69)
        xgb_sv = [0.25, -0.45, 0.0, 0.0, 0.0]
        cat_sv = [0.0, -0.85, 0.0, 0.0, 0.0]
        xgb_base = 13.0
        cat_base = 14.0

        def fake(model, **_kw):
            if model.log_pred == 13.0:
                return _StubExplainer(xgb_sv, xgb_base)
            return _StubExplainer(cat_sv, cat_base)

        monkeypatch.setattr(shap, "TreeExplainer", fake)

        from landval.modelling.explain import LiveExplanationService

        svc = LiveExplanationService(
            registry=stub_registry, feature_labels_json={"features": {}}, top_n=10
        )
        feat = _StubFeaturePipeline().compute_features(lat=-1.29, lon=36.82, size_acres=1.0)
        feat.features["size_acres"] = 1.0
        ps = PredictionService(
            registry=stub_registry,
            feature_pipeline=_StubFeaturePipeline(),
            artifacts_dir="/tmp/unused",
        )
        frame = ps._prepare_input_frame(dict(feat.features), size_acres=1.0)
        result = svc.explain(frame)

        import math

        # log_size_acres: combined = 0.10 -> effect = exp(0.10) - 1 = +10.52%
        d1 = next(d for d in result.drivers if d.feature == "log_size_acres")
        assert d1.shap_value == pytest.approx(0.10, abs=1e-9)
        assert d1.effect_pct == pytest.approx((math.exp(0.10) - 1) * 100, rel=1e-6)
        assert d1.direction == "price-increasing"
        # dist_to_nairobi_km: combined = -0.69 -> effect = exp(-0.69) - 1 = -49.98%
        d2 = next(d for d in result.drivers if d.feature == "dist_to_nairobi_km")
        assert d2.shap_value == pytest.approx(-0.69, abs=1e-9)
        assert d2.effect_pct == pytest.approx((math.exp(-0.69) - 1) * 100, abs=0.01)
        assert d2.direction == "price-decreasing"
        # infrastructure_score: combined = 0 -> effect = 0%, direction = "neutral"
        d3 = next(d for d in result.drivers if d.feature == "infrastructure_score")
        assert d3.shap_value == pytest.approx(0.0, abs=1e-9)
        assert d3.effect_pct == pytest.approx(0.0, abs=1e-9)
        assert d3.direction == "neutral"


# ----------------------------------------------------------------------
# ComparablesService tests (Cell 9.6 listings_scored.parquet)
# ----------------------------------------------------------------------


def _tiny_listings_scored_df() -> pd.DataFrame:
    """Cell 9.6 columns (subset used by ComparablesService)."""
    return pd.DataFrame(
        [
            {
                "listing_no": "L001",
                "title": "Karen 1 acre",
                "location": "Karen",
                "county": "Nairobi",
                "latitude": -1.32,
                "longitude": 36.73,
                "size_acres": 1.0,
                "listed_price_per_acre_ksh": 4_500_000.0,
                "predicted_price_per_acre_ksh": 5_000_000.0,
                "verdict": "underpriced",
            },
            {
                "listing_no": "L002",
                "title": "Kiambu 5 acres",
                "location": "Kiambu Town",
                "county": "Kiambu",
                "latitude": -1.03,
                "longitude": 36.83,
                "size_acres": 5.0,
                "listed_price_per_acre_ksh": 2_800_000.0,
                "predicted_price_per_acre_ksh": 2_500_000.0,
                "verdict": "fair",
            },
            {
                "listing_no": "L003",
                "title": "Nakuru 0.5 acre",
                "location": "Nakuru",
                "county": "Nakuru",
                "latitude": -0.30,
                "longitude": 36.07,
                "size_acres": 0.5,
                "listed_price_per_acre_ksh": 16_000_000.0,
                "predicted_price_per_acre_ksh": 6_500_000.0,
                "verdict": "overpriced",
            },
        ]
    )


class TestComparablesService:
    def test_find_within_50km_sorted_by_distance(self):
        from landval.modelling.comparables import ComparablesService

        svc = ComparablesService(
            listings_scored_df=_tiny_listings_scored_df(),
            coverage_rules={"COVERAGE_RADIUS_KM": 50},
        )
        # Point near Nairobi (-1.29, 36.82) -> L001 (~3.5 km) and L002 (~30 km) within 50 km
        comps = svc.find_comparables(lat=-1.29, lon=36.82, county="Nairobi", limit=10)
        assert len(comps) == 2
        # Sorted ascending by distance
        assert comps[0].listing_no == "L001"  # closer
        assert comps[1].listing_no == "L002"
        assert comps[0].distance_km < comps[1].distance_km
        # Each comparable has the right fields
        c = comps[0]
        assert c.size_acres == 1.0
        assert c.listed_price_per_acre_ksh == 4_500_000.0
        assert c.predicted_price_per_acre_ksh == 5_000_000.0
        assert c.verdict == "underpriced"
        assert c.county == "Nairobi"
        assert c.title == "Karen 1 acre"
        # NO list_date / days_ago field — explicitly omitted
        assert not hasattr(c, "list_date")
        assert not hasattr(c, "days_ago")

    def test_limit_respected(self):
        from landval.modelling.comparables import ComparablesService

        svc = ComparablesService(
            listings_scored_df=_tiny_listings_scored_df(),
            coverage_rules={"COVERAGE_RADIUS_KM": 200},  # wide radius catches all 3
        )
        comps = svc.find_comparables(lat=-1.29, lon=36.82, limit=2)
        assert len(comps) == 2  # limit respected even when more match

    def test_empty_when_no_listings(self):
        from landval.modelling.comparables import ComparablesService

        svc = ComparablesService(listings_scored_df=None, coverage_rules={"COVERAGE_RADIUS_KM": 50})
        assert svc.find_comparables(lat=-1.29, lon=36.82) == []

    def test_empty_when_no_listings_within_radius(self):
        from landval.modelling.comparables import ComparablesService

        svc = ComparablesService(
            listings_scored_df=_tiny_listings_scored_df(),
            coverage_rules={"COVERAGE_RADIUS_KM": 50},
        )
        # Point in northern Kenya, far from all 3 listings
        comps = svc.find_comparables(lat=3.0, lon=38.0, limit=10)
        assert comps == []

    def test_excludes_self_point(self):
        """When the prediction point coincides with a listing's coords,
        that listing is excluded (distance < 1 m)."""
        from landval.modelling.comparables import ComparablesService

        svc = ComparablesService(
            listings_scored_df=_tiny_listings_scored_df(),
            coverage_rules={"COVERAGE_RADIUS_KM": 50},
        )
        # Exact coords of L001
        comps = svc.find_comparables(lat=-1.32, lon=36.73, limit=10)
        listing_nos = [c.listing_no for c in comps]
        assert "L001" not in listing_nos  # self excluded


# ----------------------------------------------------------------------
# Combined endpoint: predict + explanation + comparables together
# ----------------------------------------------------------------------


class TestPredictEndpointWithExplanationAndComparables:
    def test_response_includes_explanation_and_comparables(self, app, client):
        """POST /api/v1/predict with stub services returns explanation +
        comparables alongside the core prediction."""
        import shap

        registry = _StubRegistry()
        ps = PredictionService(
            registry=registry,
            feature_pipeline=_StubFeaturePipeline(county="Nairobi"),
            artifacts_dir="/tmp/unused",
        )
        app.state.model_registry = registry
        app.state.prediction_service = ps

        # Stub the explanation service: monkeypatch shap.TreeExplainer so
        # LiveExplanationService produces deterministic output.
        def fake_tree_explainer(model, **_kw):
            if model.log_pred == 13.0:  # xgb
                return _StubExplainer([0.10, -0.05, 0.20, 0.0, 0.0], 13.0)
            return _StubExplainer([0.15, -0.10, 0.18, 0.0, 0.0], 14.0)  # catboost

        monkeypatch_target = shap.TreeExplainer
        original = shap.TreeExplainer
        shap.TreeExplainer = fake_tree_explainer
        try:
            from landval.modelling.explain import LiveExplanationService

            app.state.explanation_service = LiveExplanationService(
                registry=registry,
                feature_labels_json={
                    "features": {
                        "log_size_acres": {"label": "Log parcel size"},
                        "dist_to_nairobi_km": {"label": "Distance to Nairobi"},
                        "infrastructure_score": {"label": "Infrastructure score"},
                        "prop_type": {"label": "Property type"},
                        "county": {"label": "County"},
                    }
                },
                top_n=10,
            )
        finally:
            shap.TreeExplainer = original  # restore; the service has cached its explainers
        # NOTE: the LiveExplanationService caches the explainer on first call,
        # so the monkeypatched shap.TreeExplainer is captured at explain() time.
        # Re-monkeypatch before the request:
        shap.TreeExplainer = fake_tree_explainer

        # Comparables service with the tiny listings frame
        from landval.modelling.comparables import ComparablesService

        app.state.comparables_service = ComparablesService(
            listings_scored_df=_tiny_listings_scored_df(),
            coverage_rules=registry.coverage_rules,
        )

        try:
            resp = client.post(
                "/api/v1/predict",
                json={
                    "lat": -1.2921,
                    "lon": 36.8219,
                    "size_acres": 2.5,
                    "prop_type": "Land",
                    "parcel_features": {
                        "borehole": True,
                        "piped_water": False,
                        "river_water": "not_sure",
                        "water_tank": False,
                        "grid_electric": True,
                        "solar_electric": False,
                        "full_fence": True,
                        "partial_fence": False,
                        "structures": False,
                        "internal_road": "not_sure",
                    },
                    "confidence_level": 0.8,
                },
            )
        finally:
            shap.TreeExplainer = monkeypatch_target if monkeypatch_target else original
            # The unused variable above quiets lint; restore properly:
            shap.TreeExplainer = original

        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Core prediction (Cell 8.3 math)
        import math

        expected_ppa = math.exp(13.6)
        assert body["price_per_acre_ksh"] == pytest.approx(expected_ppa, rel=1e-6)
        # Explanation block present
        assert body["explanation"] is not None
        drivers = body["explanation"]["drivers"]
        assert len(drivers) > 0
        # Sorted by |shap_value| descending
        abs_shaps = [abs(d["shap_value"]) for d in drivers]
        assert abs_shaps == sorted(abs_shaps, reverse=True)
        # First driver has the expected fields
        d0 = drivers[0]
        assert "feature" in d0
        assert "label" in d0
        assert "shap_value" in d0
        assert "effect_pct" in d0
        assert "direction" in d0
        # Shares recomputed from loaded weights
        cov = body["explanation"]["coverage"]
        assert cov["tree_share_explained_by_shap"] == pytest.approx(1.0, abs=1e-6)
        assert cov["tabnet_share_not_covered"] == pytest.approx(0.0, abs=1e-6)
        assert cov["explained_members"] == ["xgb", "catboost"]
        assert cov["latency_ms"] >= 0.0
        # Comparables present
        comps = body["comparables"]
        assert len(comps) >= 1
        # L001 is closest to (-1.29, 36.82) at ~3.5 km
        assert comps[0]["listing_no"] == "L001"
        assert "distance_km" in comps[0]
        # NO list_date / days_ago in the comparable response
        assert "list_date" not in comps[0]
        assert "days_ago" not in comps[0]

    def test_explanation_null_when_service_missing(self, app, client):
        """When explanation_service is None (e.g. shap not installed), the
        response's explanation field is null but the prediction still
        succeeds."""
        registry = _StubRegistry()
        ps = PredictionService(
            registry=registry,
            feature_pipeline=_StubFeaturePipeline(county="Nairobi"),
            artifacts_dir="/tmp/unused",
        )
        app.state.model_registry = registry
        app.state.prediction_service = ps
        app.state.explanation_service = None  # explicitly absent
        app.state.comparables_service = None

        resp = client.post(
            "/api/v1/predict",
            json={
                "lat": -1.29,
                "lon": 36.82,
                "size_acres": 1.0,
                "confidence_level": 0.8,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["explanation"] is None
        assert body["comparables"] == []
        # Core prediction still valid
        import math

        assert body["price_per_acre_ksh"] == pytest.approx(math.exp(13.6), rel=1e-6)


# ----------------------------------------------------------------------
# Registry SHAP-coverage helpers
# ----------------------------------------------------------------------


class TestRegistryShapCoverage:
    def test_recomputed_shap_coverage_pruned_tabnet(self):
        """When TabNet is pruned (typical case), tree_share = 1.0."""
        from landval.modelling.registry import ModelRegistry

        reg = ModelRegistry(artifacts_dir="/tmp/unused")
        reg.kept_members = ["xgb", "catboost"]
        reg.kept_weights = {"xgb": 0.45, "catboost": 0.55}
        cov = reg.recomputed_shap_coverage()
        assert cov["tree_share_explained_by_shap"] == pytest.approx(1.0, abs=1e-6)
        assert cov["tabnet_share_not_covered"] == pytest.approx(0.0, abs=1e-6)
        assert cov["explained_members"] == ["xgb", "catboost"]
        assert cov["unexplained_members"] == []

    def test_recomputed_shap_coverage_kept_tabnet(self):
        """When TabNet is kept, tabnet_share = its weight; tree_share = 1 - that."""
        from landval.modelling.registry import ModelRegistry

        reg = ModelRegistry(artifacts_dir="/tmp/unused")
        reg.kept_members = ["xgb", "catboost", "tabnet"]
        reg.kept_weights = {"xgb": 0.30, "catboost": 0.40, "tabnet": 0.30}
        cov = reg.recomputed_shap_coverage()
        assert cov["tree_share_explained_by_shap"] == pytest.approx(0.70, abs=1e-6)
        assert cov["tabnet_share_not_covered"] == pytest.approx(0.30, abs=1e-6)
        assert "tabnet" in cov["unexplained_members"]

    def test_tree_members_loaded_property(self):
        from landval.modelling.registry import ModelRegistry

        reg = ModelRegistry(artifacts_dir="/tmp/unused")
        reg.kept_members = ["xgb", "catboost", "tabnet"]
        assert reg.tree_members_loaded == ["xgb", "catboost"]
        reg.kept_members = ["tabnet"]
        assert reg.tree_members_loaded == []
