"""Logic tests for scripts/parity_check.py — run in CI WITHOUT real artefacts.

These tests prove the Part 1 fix with asserted numeric values, not just
"runs without error":

  * the parcel size comes from parity_fixture.parquet joined on listing_no
    (compared as str, including integral floats like ``117077054.0``);
  * a row with NO fixture match, or whose fixture ``log_size_acres`` is NaN,
    is skipped and counted under ``skipped_no_size`` — never given an
    invented size;
  * FEATURE / MEMBER / ENSEMBLE parity are computed per layer, so a wrong
    weight shows up as ensemble-only divergence while members still pass;
  * the 99% rule and the 1e-3 tolerance are untouched.

The stub ensemble's member predictions DEPEND on log_size_acres, so the old
``exp(train_median_log)`` ~35M-acre fallback would break every assertion
here — this is the regression proof.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Ensure src/, backend/ and the repo root (for ``scripts``) are importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

from landval.features.pipeline import FeatureResult  # noqa: E402
from landval.modelling.preprocessing import PipelinePreprocessor  # noqa: E402
from scripts.parity_check import (  # noqa: E402
    _listing_key,
    run_parity_check,
)

# ----------------------------------------------------------------------
# Production-shaped stub: features are EXACTLY the production model's
# (log_size_acres, dist_to_county_town_km, longitude) and each member's
# prediction is an explicit function of log_size_acres, so a wrong size
# changes every prediction.
# ----------------------------------------------------------------------

_PROD_FEATURES = [
    {"name": "log_size_acres", "type": "numeric"},
    {"name": "dist_to_county_town_km", "type": "numeric"},
    {"name": "longitude", "type": "numeric"},
]

# Member formulas on the log scale: pred = a * log_size_acres + b
_MEMBER_FORMULAS = {
    "xgb": (0.30, 17.10),
    "catboost": (0.20, 17.40),
}


def _member_pred(member: str, log_size: float) -> float:
    a, b = _MEMBER_FORMULAS[member]
    return a * log_size + b


class _FormulaModel:
    """Predicts a * log_size_acres + b from the prepared frame's column."""

    def __init__(self, member: str):
        self.member = member

    def predict(self, frame) -> np.ndarray:
        lsa = np.asarray(frame["log_size_acres"], dtype=float)
        return np.asarray([_member_pred(self.member, v) for v in lsa], dtype=float)


class _StubRegistry:
    """Quack like ModelRegistry with the production feature list."""

    loaded = True
    kept_members = ["xgb", "catboost"]
    kept_weights: dict[str, float] = {}
    dropped_models: dict[str, dict] = {}
    feature_list = _PROD_FEATURES
    feature_names = [f["name"] for f in _PROD_FEATURES]
    categorical_features: list[str] = []
    numeric_features = [f["name"] for f in _PROD_FEATURES]
    imputation_values: dict[str, float] = {}
    category_levels: dict[str, list[str]] = {}
    tabnet_target: dict[str, float] = {}
    preprocessing: dict = {}
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
    guards: dict[str, str] = {}

    def __init__(self, weights: dict[str, float] | None = None):
        self.models = {m: _FormulaModel(m) for m in self.kept_members}
        self.kept_weights = weights or {"xgb": 0.4, "catboost": 0.6}
        df = pd.DataFrame(
            {
                "log_size_acres": [0.0, 1.0, 2.0],
                "dist_to_county_town_km": [0.0, 50.0, 200.0],
                "longitude": [36.0, 36.5, 37.0],
            }
        )
        self.preprocessor = PipelinePreprocessor(
            feature_cols=self.feature_names, categorical_cols=[]
        ).fit(df)

    @property
    def model_order(self) -> list[str]:
        return self.kept_members

    @property
    def weights_array(self):
        return np.asarray([self.kept_weights[k] for k in self.model_order], dtype=float)

    def conformal_q(self, level: float) -> float | None:
        return self.conformal_q_by_level.get(float(level))


class _StubPipeline:
    """Deterministic feature pipeline: proximity from a fixed table."""

    def __init__(self):
        self._town_dists = {
            (-1.29, 36.82): 5.0,
            (-0.30, 36.07): 80.0,
            (0.50, 35.40): 210.0,
        }

    def compute_features(self, lat, lon, size_acres, prop_type="Land", parcel_features=None):
        town = self._town_dists.get((round(lat, 2), round(lon, 2)), 42.0)
        features = {
            "log_size_acres": math.log(size_acres) if size_acres > 0 else float("nan"),
            "dist_to_county_town_km": town,
            "longitude": lon,
            "prop_type": prop_type,
            "county": "Nairobi",
        }
        return FeatureResult(
            features=features,
            county="Nairobi",
            diagnostics={"county": "Nairobi", "infra_source": "parcel_checklist"},
        )


# ----------------------------------------------------------------------
# Synthetic artefact builders
# ----------------------------------------------------------------------

_INFRA_ITEMS = (
    "borehole",
    "piped_water",
    "river_water",
    "water_tank",
    "grid_electric",
    "solar_electric",
    "full_fence",
    "partial_fence",
    "structures",
    "internal_road",
)


def _stub_town_dist(lat: float, lon: float) -> float:
    """The stub pipeline's dist_to_county_town_km for a point."""
    return _StubPipeline()._town_dists.get((round(lat, 2), round(lon, 2)), 42.0)


def _fixture_row(listing_no: int | str, lat: float, lon: float, log_size: float, county="Nairobi"):
    row = {
        "listing_no": listing_no,
        "latitude": lat,
        "longitude": lon,
        "county": county,
        "log_size_acres": log_size,
        # SAME value the stub pipeline computes, so FEATURE parity passes —
        # the point of this fixture is the SIZE join, not feature drift.
        "dist_to_county_town_km": _stub_town_dist(lat, lon),
        "infra_source": "parcel_checklist",
    }
    for i, item in enumerate(_INFRA_ITEMS):
        row[f"infra_{item}"] = i % 2  # deterministic 0/1 pattern
    return row


def _prediction_row(listing_no, lat, lon, log_size, weights, split="test", y=17.5):
    """Build a stored-prediction row using the SAME member formulas.

    The stored member predictions and the weighted ensemble are computed from
    ``log_size`` — exactly what the recomputation should reproduce when it
    joins the fixture's size.
    """
    row = {
        "listing_no": listing_no,
        "latitude": lat,
        "longitude": lon,
        "county": "Nairobi",
        "prop_type": "Land",
        "y_true": y,
        "split": split,
        "fold": -1,
    }
    ens = 0.0
    for m in ("xgb", "catboost"):
        p = _member_pred(m, log_size)
        row[f"pred_{m}"] = p
        ens += weights[m] * p
    row["pred_weighted_ensemble"] = ens
    return row


_WEIGHTS = {"xgb": 0.4, "catboost": 0.6}


def _write_synthetic_artifacts(tmp_path: Path, weights: dict[str, float]) -> Path:
    """Write the synthetic parity_fixture + test/OOF parquets.

    Listings:
      117077054  log_size = ln(2.0)   -> matched, comparable
      112146807  log_size = ln(5.0)   -> matched, comparable
      115000001  log_size = NaN       -> fixture match but NaN size -> skipped
      119999999  (no fixture row)     -> no match -> skipped
    """
    art = tmp_path / "artifacts"
    (art / "app_exports").mkdir(parents=True, exist_ok=True)

    fixture = pd.DataFrame(
        [
            _fixture_row(117077054, -1.29, 36.82, math.log(2.0)),
            _fixture_row(112146807, -0.30, 36.07, math.log(5.0)),
            _fixture_row(115000001, 0.50, 35.40, float("nan")),
        ]
    )
    fixture.to_parquet(art / "parity_fixture.parquet", index=False)

    test_rows = [
        _prediction_row(117077054, -1.29, 36.82, math.log(2.0), weights),
        _prediction_row(112146807, -0.30, 36.07, math.log(5.0), weights),
        _prediction_row(115000001, 0.50, 35.40, math.log(2.0), weights),  # NaN in fixture
        _prediction_row(119999999, 1.20, 37.00, math.log(3.0), weights),  # no fixture row
    ]
    pd.DataFrame(test_rows).to_parquet(art / "app_exports" / "test_predictions.parquet", index=False)

    oof_rows = [
        _prediction_row(117077054, -1.29, 36.82, math.log(2.0), weights, split="dev"),
    ]
    pd.DataFrame(oof_rows).to_parquet(art / "app_exports" / "oof_predictions.parquet", index=False)
    return art


class _ScriptHarness:
    """Patch point: parity_check builds the service itself, so we monkeypatch
    its loader to return our stub service."""

    def __init__(self, weights: dict[str, float], monkeypatch):
        from landval.modelling.predict import PredictionService

        self.registry = _StubRegistry(weights)
        self.service = PredictionService(
            registry=self.registry,
            feature_pipeline=_StubPipeline(),
            artifacts_dir="/tmp/unused",
        )
        monkeypatch.setattr(
            "scripts.parity_check._load_registry_and_service",
            lambda _adir: self.service,
        )


# ----------------------------------------------------------------------
# listing_no key normalisation
# ----------------------------------------------------------------------


class TestListingKey:
    def test_int(self):
        assert _listing_key(117077054) == "117077054"

    def test_integral_float(self):
        """A parquet that stored listing_no as float64 (117077054.0) must
        join the fixture's integer key."""
        assert _listing_key(117077054.0) == "117077054"
        assert _listing_key(np.float64(117077054.0)) == "117077054"

    def test_string(self):
        assert _listing_key("117077054") == "117077054"
        assert _listing_key(" 112146807 ") == "112146807"

    def test_nan_and_none(self):
        assert _listing_key(float("nan")) is None
        assert _listing_key(None) is None


# ----------------------------------------------------------------------
# End-to-end parity run on synthetic artefacts
# ----------------------------------------------------------------------


class TestParityCheckSynthetic:
    def test_full_pass_with_correct_sizes(self, tmp_path, monkeypatch):
        """With the fixture join, every comparable row must pass at 100% —
        and the numbers must equal the member formulas evaluated at the
        FIXTURE's log_size_acres, not at exp(train_median_log)."""
        art = _write_synthetic_artifacts(tmp_path, _WEIGHTS)
        harness = _ScriptHarness(_WEIGHTS, monkeypatch)

        ok, report = run_parity_check(artifacts_dir=str(art))
        assert ok is True

        t = report["test_predictions"]
        # 4 rows, 2 comparable, 2 skipped (1 NaN fixture size + 1 no match)
        assert t["n_rows"] == 4
        assert t["n_compared"] == 2
        assert t["n_skipped_no_size"] == 2
        assert t["skipped_no_size_breakdown"] == {
            "no_fixture_match": 1,
            "fixture_nan_log_size_acres": 1,
        }
        # listing 119999999 is the no-match example; 115000001 the NaN one
        assert set(t["skipped_no_size_examples"]) == {"115000001", "119999999"}

        # ENSEMBLE parity: exact formulas at the FIXTURE sizes
        ens = t["ensemble_parity"]
        assert ens["n"] == 2
        assert ens["within"] == 2
        assert ens["pass_rate_pct"] == 100.0
        assert ens["max_diff"] == 0.0

        # MEMBER parity with asserted values: for ln(2):
        #   xgb      = 0.30*ln(2) + 17.10
        #   catboost = 0.20*ln(2) + 17.40
        #   ensemble = 0.4*xgb + 0.6*catboost
        ln2, ln5 = math.log(2.0), math.log(5.0)
        for m in ("xgb", "catboost"):
            assert t["member_parity"][m]["pass_rate_pct"] == 100.0
            assert t["member_parity"][m]["max_diff"] == 0.0
        expected_ens_ln2 = 0.4 * _member_pred("xgb", ln2) + 0.6 * _member_pred("catboost", ln2)
        expected_ens_ln5 = 0.4 * _member_pred("xgb", ln5) + 0.6 * _member_pred("catboost", ln5)
        stored = {r["listing_no"]: r for r in [ _prediction_row(117077054, -1.29, 36.82, ln2, _WEIGHTS),
                                                 _prediction_row(112146807, -0.30, 36.07, ln5, _WEIGHTS) ]}
        assert stored[117077054]["pred_weighted_ensemble"] == pytest.approx(expected_ens_ln2, abs=1e-12)
        assert stored[112146807]["pred_weighted_ensemble"] == pytest.approx(expected_ens_ln5, abs=1e-12)

        # FEATURE parity: dist_to_county_town_km + longitude reproduce the fixture
        for f in ("dist_to_county_town_km", "longitude"):
            assert t["feature_parity"][f]["pass_rate_pct"] == 100.0
            assert t["feature_parity"][f]["n"] == 2

        # The old bug's signature — exp(train_median_log) — is gone: with a
        # ~35M-acre size the member formulas would return ~0.3*17.37+17.10
        # etc. and NOTHING would match. 100% pass proves the fixture size
        # (exp(log_size_acres)) was used.
        wrong_size_pred = 0.4 * _member_pred("xgb", 17.37) + 0.6 * _member_pred("catboost", 17.37)
        assert abs(wrong_size_pred - expected_ens_ln2) > 1.0  # distinguishable

        # OOF split: 1 row, passes
        assert report["oof_predictions"]["n_compared"] == 1
        assert report["oof_predictions"]["ensemble_parity"]["pass_rate_pct"] == 100.0

        # Aggregate layer rates present
        agg = report["aggregate_pass_rates"]
        assert agg["ensemble_parity"] == 100.0
        assert agg["member_parity"]["xgb"] == 100.0
        assert agg["member_parity"]["catboost"] == 100.0

    def test_wrong_weights_fail_ensemble_but_pass_members(self, tmp_path, monkeypatch):
        """The layer separation proof: stored predictions use weights
        {xgb: .4, catboost: .6} but the serving registry carries
        {xgb: .62, catboost: .38} — the live incident's shape.

        MEMBER parity stays 100% (model files fine) while ENSEMBLE parity
        drops to 0% and overall_pass is False."""
        art = _write_synthetic_artifacts(tmp_path, _WEIGHTS)
        serving_weights = {"xgb": 0.62, "catboost": 0.38}  # the live drift shape
        _ScriptHarness(serving_weights, monkeypatch)

        ok, report = run_parity_check(artifacts_dir=str(art))
        assert ok is False

        t = report["test_predictions"]
        assert t["member_parity"]["xgb"]["pass_rate_pct"] == 100.0
        assert t["member_parity"]["catboost"]["pass_rate_pct"] == 100.0
        # Ensemble diverges: 0.4/0.6 stored vs 0.62/0.38 serving shifts the
        # ln(2) row by 0.22*(xgb(ln2) - catboost(ln2)); with the member
        # formulas a*log_size + b that is 0.22*((0.30-0.20)*ln2 + (17.10-17.40))
        ln2 = math.log(2.0)
        shift = abs(0.22 * ((0.30 - 0.20) * ln2 + (17.10 - 17.40)))
        assert shift > 1e-3  # beyond tolerance
        assert t["ensemble_parity"]["pass_rate_pct"] == 0.0
        # max_diff is rounded to 6dp in the report — compare at 1e-6
        assert t["ensemble_parity"]["max_diff"] == pytest.approx(shift, abs=1e-6)
        assert report["overall_pass"] is False

    def test_every_row_skipped_when_fixture_absent(self, tmp_path, monkeypatch):
        """No parity_fixture.parquet -> every row is skipped_no_size; the
        script NEVER invents a size (the old exp(train_median_log) path)."""
        art = tmp_path / "artifacts"
        (art / "app_exports").mkdir(parents=True)
        rows = [
            _prediction_row(117077054, -1.29, 36.82, math.log(2.0), _WEIGHTS),
            _prediction_row(112146807, -0.30, 36.07, math.log(5.0), _WEIGHTS),
        ]
        pd.DataFrame(rows).to_parquet(art / "app_exports" / "test_predictions.parquet", index=False)
        _ScriptHarness(_WEIGHTS, monkeypatch)

        ok, report = run_parity_check(artifacts_dir=str(art))
        t = report["test_predictions"]
        assert t["n_compared"] == 0
        assert t["n_skipped_no_size"] == 2
        assert t["skipped_no_size_breakdown"]["no_fixture_match"] == 2
        # No comparable rows -> SKIP, not FAIL
        assert ok is False
        assert report["overall_pass"] is False

    def test_tolerance_not_widened(self, tmp_path, monkeypatch):
        """A member shifted by 5e-3 (5x tolerance) must FAIL at the default
        1e-3 tolerance — the script never widens it."""
        art = _write_synthetic_artifacts(tmp_path, _WEIGHTS)

        # Shift the stored xgb predictions by +5e-3 (still tiny, but 5x tol)
        path = art / "app_exports" / "test_predictions.parquet"
        df = pd.read_parquet(path)
        df["pred_xgb"] = df["pred_xgb"] + 5e-3
        df["pred_weighted_ensemble"] = df["pred_weighted_ensemble"] + 0.4 * 5e-3
        df.to_parquet(path, index=False)

        _ScriptHarness(_WEIGHTS, monkeypatch)
        ok, report = run_parity_check(artifacts_dir=str(art))
        t = report["test_predictions"]
        assert t["member_parity"]["xgb"]["pass_rate_pct"] == 0.0
        assert t["member_parity"]["catboost"]["pass_rate_pct"] == 100.0
        assert t["ensemble_parity"]["pass_rate_pct"] == 0.0
        assert report["tolerance_log_scale"] == 1e-3
        assert ok is False

    def test_recompute_for_listings(self, tmp_path, monkeypatch):
        """The debug helper returns per-layer stored/recomputed numbers."""
        art = _write_synthetic_artifacts(tmp_path, _WEIGHTS)
        _ScriptHarness(_WEIGHTS, monkeypatch)

        from scripts.parity_check import recompute_for_listings

        out = recompute_for_listings(str(art), [117077054, 112146807, 119999999])
        assert set(out.keys()) == {"117077054", "112146807"}  # 119999999 has no fixture size
        r = out["117077054"]
        assert r["split"] == "test"
        assert r["size_acres"] == pytest.approx(2.0, abs=1e-6)  # exp(ln 2), rounded 6dp
        ln2 = math.log(2.0)
        # recompute_for_listings rounds to 6dp — compare at 1e-6
        assert r["recomputed"]["xgb"] == pytest.approx(_member_pred("xgb", ln2), abs=1e-6)
        assert r["recomputed"]["catboost"] == pytest.approx(_member_pred("catboost", ln2), abs=1e-6)
        assert r["recomputed"]["ensemble"] == pytest.approx(
            0.4 * _member_pred("xgb", ln2) + 0.6 * _member_pred("catboost", ln2), abs=1e-6
        )
        assert all(r["within_tol"].values())
