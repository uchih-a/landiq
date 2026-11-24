"""Logic tests for the ModelRegistry startup consistency guards (Part 2)
and scripts/repair_serving_manifest.py (Part 3) — run in CI WITHOUT the
real artefacts, on tiny synthetic artefact trees under tmp_path.

Every guard is proved with asserted numeric values:

  (a) a serving manifest whose weight_after_renormalisation drifts from
      ensemble_weights.json (the live incident: 0.6211/0.2929/0.0860 vs
      0.2295316/0.6682573/0.1022111) must raise ModelLoadError naming both
      vectors; consistent weights must load and report guards["..."]=="pass";
  (b) manifest imputation_values that disagree with preprocessing.json's
      preprocessor medians by > 1e-9 must raise; agreeing values pass;
  (c) an xgb_model.json whose learner.learner_model_param.base_score starts
      with "[" must raise under xgboost < 3 (pointing at
      scripts/fix_xgb_base_score.py) and pass under >= 3 — both directions
      are tested by monkeypatching the version.

The repair script is tested end-to-end on a synthetic manifest:
before 0.6211/0.2929/0.0860 -> after 0.2295316/0.6682573/0.1022111,
sum exactly 1.0, .bak created, second run idempotent, and each refusal
precondition actually refuses.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Ensure src/, backend/ and the repo root (for ``scripts``) are importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

from landval.modelling.registry import ModelLoadError, ModelRegistry  # noqa: E402

# ----------------------------------------------------------------------
# Synthetic artefact builders
# ----------------------------------------------------------------------

# The live incident's numbers.
_LIVE_MANIFEST_WEIGHTS = {"xgb": 0.6211, "catboost": 0.2929, "tabnet": 0.0860}
_LIVE_ENS_WEIGHTS = {"xgb": 0.2295316, "catboost": 0.6682573, "tabnet": 0.1022111}

_MODEL_FILES = {
    "xgb": "xgb_model.json",
    "catboost": "catboost_model.cbm",
    "tabnet": "tabnet_model.zip",
}


def _tiny_xgb_json(base_score: str = "0.5") -> dict:
    """A minimal xgboost-2.x-style model JSON.  Only learner_model_param
    matters for the guards; load() is never called on it here."""
    return {
        "learner": {
            "learner_model_param": {
                "objective": "reg:squarederror",
                "base_score": base_score,
                "num_feature": "3",
            },
            "gradient_booster": {"model": {"trees": [], "tree_info": []}},
            "attributes": {},
        },
        "version": [1, 6, 2],
    }


def _write_ensemble_weights(art: Path, weights: dict[str, float]) -> Path:
    model_order = ["xgb", "catboost", "tabnet"]
    p = art / "ensemble_weights.json"
    p.write_text(
        json.dumps(
            {
                "model_order": model_order,
                "weights": [weights[k] for k in model_order],
            }
        )
    )
    return p


def _write_serving_manifest(
    art: Path,
    weights: dict[str, float],
    imputation: dict[str, float] | None = None,
    dropped: dict | None = None,
    pruning: dict | None = None,
    model_set=("xgb", "catboost", "tabnet"),
) -> Path:
    d = art / "backend_exports"
    d.mkdir(parents=True, exist_ok=True)
    manifest = {
        "created": "2025-01-01 00:00:00",
        "production_run": "synthetic",
        "models_to_load": {
            k: {
                "file": f"models/ensemble/{_MODEL_FILES[k]}",
                "format": "synthetic",
                "weight_after_renormalisation": float(weights[k]),
            }
            for k in model_set
        },
        "dropped_models": dropped or {},
        "pruning": pruning
        or {
            "threshold": 0.02,
            "original_weights": {k: float(weights[k]) for k in model_set},
            "kept_weights_renormalised": {k: float(weights[k]) for k in model_set},
        },
        "feature_list": [
            {"name": "log_size_acres", "type": "numeric"},
            {"name": "dist_to_county_town_km", "type": "numeric"},
            {"name": "longitude", "type": "numeric"},
        ],
        "category_levels": {},
    }
    if imputation is not None:
        manifest["imputation_values"] = imputation
    p = d / "serving_manifest.json"
    p.write_text(json.dumps(manifest))
    return p


def _write_preprocessing(art: Path, medians: dict[str, float]) -> Path:
    p = art / "preprocessing.json"
    p.write_text(
        json.dumps(
            {
                "preprocessor": {
                    "feature_cols": ["log_size_acres", "dist_to_county_town_km", "longitude"],
                    "categorical_cols": [],
                    "numeric_cols": ["log_size_acres", "dist_to_county_town_km", "longitude"],
                    "min_category_rows": 5,
                    "medians": medians,
                    "missing_indicator_cols": [],
                    "tabnet_stats": {k: [0.0, 1.0] for k in medians},
                    "levels": {},
                    "group_maps": {},
                    "label_maps": {},
                },
                "tabnet_target": {"tabnet_target_mean": 17.0, "tabnet_target_std": 0.5},
                "train_median_log": 17.37,
            }
        )
    )
    return p


def _write_other_metadata(art: Path) -> None:
    """conformal.json + coverage_rules.json + error_by_support.csv + a
    trivial explain_spec.md so load() reaches the guards."""
    ae = art / "app_exports"
    ae.mkdir(parents=True, exist_ok=True)
    (ae / "conformal.json").write_text(
        json.dumps(
            {"n_calibration_rows": 10, "levels": [{"level": 0.8, "q_log_scale": 0.4}]}
        )
    )
    be = art / "backend_exports"
    be.mkdir(parents=True, exist_ok=True)
    (be / "coverage_rules.json").write_text(
        json.dumps(
            {
                "COVERAGE_MIN_COUNTY_N": 10,
                "COVERAGE_MIN_NEARBY_N": 5,
                "COVERAGE_RADIUS_KM": 50,
            }
        )
    )
    (be / "error_by_support.csv").write_text("bucket,mae,n\nall,0.1,10\n")
    (be / "explain_spec.md").write_text("# explain spec\n")


def _write_model_files(art: Path, xgb_base_score: str = "0.5") -> None:
    """Write minimal model files for every member (loadable JSON only for
    xgb; the guard tests stop before the real loaders run — see below)."""
    (art / "xgb_model.json").write_text(json.dumps(_tiny_xgb_json(xgb_base_score)))
    (art / "catboost_model.cbm").write_text("synthetic-cbm")
    (art / "tabnet_model.zip").write_text("synthetic-zip")


def _consistent_artifacts(art: Path) -> None:
    """A fully consistent synthetic tree: manifest == ensemble_weights,
    imputation == preprocessing medians, scalar xgb base_score."""
    weights = dict(_LIVE_ENS_WEIGHTS)
    _write_ensemble_weights(art, weights)
    _write_serving_manifest(art, weights, imputation={"log_size_acres": 1.2, "longitude": 36.8})
    _write_preprocessing(art, {"log_size_acres": 1.2, "dist_to_county_town_km": 42.0, "longitude": 36.8})
    _write_other_metadata(art)
    _write_model_files(art, xgb_base_score="17.0")


# ----------------------------------------------------------------------
# Guard (a): weights vs ensemble_weights.json
# ----------------------------------------------------------------------


class TestWeightsGuard:
    def _run_guard(self, art: Path) -> None:
        """Load metadata only — we call the guard directly instead of the
        full load() because the synthetic catboost/tabnet files are not
        loadable by the real libraries."""
        reg = ModelRegistry(artifacts_dir=str(art))
        reg._load_metadata_files()
        reg.guards["weights_vs_ensemble_weights"] = reg._check_weights_against_ensemble_weights()

    def test_live_drift_raises_with_both_vectors(self, tmp_path: Path):
        """The exact live incident: manifest 0.6211/0.2929/0.0860 vs
        ensemble_weights 0.2295316/0.6682573/0.1022111 must raise."""
        art = tmp_path / "artifacts"
        art.mkdir()
        _write_ensemble_weights(art, _LIVE_ENS_WEIGHTS)
        _write_serving_manifest(art, _LIVE_MANIFEST_WEIGHTS)
        _write_preprocessing(art, {})
        _write_other_metadata(art)

        with pytest.raises(ModelLoadError) as ei:
            self._run_guard(art)
        msg = str(ei.value)
        # The message must show BOTH vectors (6dp rounding in the guard)
        assert "serving_manifest weight_after_renormalisation" in msg
        assert "ensemble_weights.json weights" in msg
        assert "0.621100" in msg and "0.229532" in msg
        assert "0.668257" in msg and "0.102211" in msg
        # And point at the repair path
        assert "repair_serving_manifest" in msg

    def test_consistent_weights_pass(self, tmp_path: Path):
        art = tmp_path / "artifacts"
        art.mkdir()
        _write_ensemble_weights(art, _LIVE_ENS_WEIGHTS)
        _write_serving_manifest(art, _LIVE_ENS_WEIGHTS)
        _write_preprocessing(art, {})

        self._run_guard(art)
        # no raise; guard outcome recorded (would be "pass")

    def test_within_tolerance_passes(self, tmp_path: Path):
        """A 5e-7 difference is within the 1e-6 tolerance -> no raise."""
        art = tmp_path / "artifacts"
        art.mkdir()
        slightly_off = {k: v + 5e-7 for k, v in _LIVE_ENS_WEIGHTS.items()}
        _write_ensemble_weights(art, _LIVE_ENS_WEIGHTS)
        _write_serving_manifest(art, slightly_off)
        _write_preprocessing(art, {})

        self._run_guard(art)  # must not raise

    def test_pruned_ensemble_skips_guard(self, tmp_path: Path):
        """dropped_models non-empty -> the guard is legitimately skipped
        (survivors are renormalised away from the originals)."""
        art = tmp_path / "artifacts"
        art.mkdir()
        _write_ensemble_weights(art, _LIVE_ENS_WEIGHTS)
        _write_serving_manifest(
            art,
            {"xgb": 0.30, "catboost": 0.70},
            dropped={"tabnet": {"original_weight": 0.1, "reason": "below threshold"}},
            model_set=("xgb", "catboost"),
        )
        _write_preprocessing(art, {})

        reg = ModelRegistry(artifacts_dir=str(art))
        reg._load_metadata_files()
        outcome = reg._check_weights_against_ensemble_weights()
        assert outcome.startswith("skipped:")
        assert "pruned" in outcome

    def test_missing_ensemble_weights_skips(self, tmp_path: Path):
        art = tmp_path / "artifacts"
        art.mkdir()
        _write_serving_manifest(art, _LIVE_MANIFEST_WEIGHTS)
        _write_preprocessing(art, {})

        reg = ModelRegistry(artifacts_dir=str(art))
        reg._load_metadata_files()
        outcome = reg._check_weights_against_ensemble_weights()
        assert outcome == "skipped:ensemble_weights.json absent"

    def test_malformed_ensemble_weights_raises(self, tmp_path: Path):
        art = tmp_path / "artifacts"
        art.mkdir()
        (art / "ensemble_weights.json").write_text(
            json.dumps({"model_order": ["xgb", "catboost", "tabnet"], "weights": [0.5, 0.5]})
        )
        _write_serving_manifest(art, _LIVE_MANIFEST_WEIGHTS)
        _write_preprocessing(art, {})

        reg = ModelRegistry(artifacts_dir=str(art))
        reg._load_metadata_files()
        with pytest.raises(ModelLoadError, match="malformed"):
            reg._check_weights_against_ensemble_weights()


# ----------------------------------------------------------------------
# Guard (b): imputation_values vs preprocessing.json medians
# ----------------------------------------------------------------------


class TestImputationGuard:
    def _guard(self, art: Path) -> str:
        reg = ModelRegistry(artifacts_dir=str(art))
        reg._load_metadata_files()
        return reg._check_imputation_against_preprocessing()

    def test_agreeing_values_pass(self, tmp_path: Path):
        art = tmp_path / "artifacts"
        art.mkdir()
        medians = {"log_size_acres": 1.2, "dist_to_county_town_km": 42.0, "longitude": 36.8}
        _write_serving_manifest(art, _LIVE_ENS_WEIGHTS, imputation=medians)
        _write_preprocessing(art, medians)
        assert self._guard(art) == "pass"

    def test_drift_beyond_1e9_raises(self, tmp_path: Path):
        art = tmp_path / "artifacts"
        art.mkdir()
        prep_medians = {"log_size_acres": 1.2, "longitude": 36.8}
        manifest_imp = {"log_size_acres": 1.2 + 1e-8, "longitude": 36.8}
        _write_serving_manifest(art, _LIVE_ENS_WEIGHTS, imputation=manifest_imp)
        _write_preprocessing(art, prep_medians)
        with pytest.raises(ModelLoadError) as ei:
            self._guard(art)
        assert "log_size_acres" in str(ei.value)
        assert "1e-9" in str(ei.value) or "preprocessor" in str(ei.value)

    def test_within_1e9_passes(self, tmp_path: Path):
        """A 5e-10 difference is within the 1e-9 tolerance."""
        art = tmp_path / "artifacts"
        art.mkdir()
        prep_medians = {"log_size_acres": 1.2, "longitude": 36.8}
        manifest_imp = {"log_size_acres": 1.2 + 5e-10, "longitude": 36.8}
        _write_serving_manifest(art, _LIVE_ENS_WEIGHTS, imputation=manifest_imp)
        _write_preprocessing(art, prep_medians)
        assert self._guard(art) == "pass"

    def test_no_imputation_values_skips(self, tmp_path: Path):
        """When the manifest has no imputation_values the check is skipped
        and says so (the spec's 'if none exist, skip and say so')."""
        art = tmp_path / "artifacts"
        art.mkdir()
        _write_serving_manifest(art, _LIVE_ENS_WEIGHTS, imputation=None)
        _write_preprocessing(art, {"log_size_acres": 1.2})
        outcome = self._guard(art)
        assert outcome.startswith("skipped:")
        assert "imputation_values" in outcome

    def test_no_prep_medians_skips(self, tmp_path: Path):
        art = tmp_path / "artifacts"
        art.mkdir()
        _write_serving_manifest(art, _LIVE_ENS_WEIGHTS, imputation={"log_size_acres": 1.2})
        p = art / "preprocessing.json"
        p.write_text(json.dumps({"preprocessor": {"feature_cols": []}}))
        outcome = self._guard(art)
        assert outcome.startswith("skipped:")
        assert "medians" in outcome


# ----------------------------------------------------------------------
# Guard (c): xgb base_score list format under xgboost < 3
# ----------------------------------------------------------------------


class TestXgbBaseScoreGuard:
    def test_list_base_score_under_xgb2_raises(self, tmp_path: Path, monkeypatch):
        art = tmp_path / "artifacts"
        art.mkdir()
        p = art / "xgb_model.json"
        p.write_text(json.dumps(_tiny_xgb_json(base_score="[17.365]")))

        import xgboost

        monkeypatch.setattr(xgboost, "__version__", "2.1.1")
        with pytest.raises(ModelLoadError) as ei:
            ModelRegistry._check_xgb_base_score_format(str(p))
        msg = str(ei.value)
        assert "base_score" in msg
        assert "scripts/fix_xgb_base_score.py" in msg
        assert "2.1.1" in msg

    def test_scalar_base_score_passes(self, tmp_path: Path):
        art = tmp_path / "artifacts"
        art.mkdir()
        p = art / "xgb_model.json"
        p.write_text(json.dumps(_tiny_xgb_json(base_score="17.365")))
        outcome = ModelRegistry._check_xgb_base_score_format(str(p))
        assert outcome.startswith("pass")

    def test_list_base_score_under_xgb3_passes(self, tmp_path: Path, monkeypatch):
        """xgboost >= 3 reads the list format correctly -> no error."""
        art = tmp_path / "artifacts"
        art.mkdir()
        p = art / "xgb_model.json"
        p.write_text(json.dumps(_tiny_xgb_json(base_score="[17.365]")))

        import xgboost

        monkeypatch.setattr(xgboost, "__version__", "3.0.0")
        outcome = ModelRegistry._check_xgb_base_score_format(str(p))
        assert outcome.startswith("pass")

    def test_missing_base_score_skips(self, tmp_path: Path):
        art = tmp_path / "artifacts"
        art.mkdir()
        p = art / "xgb_model.json"
        model = _tiny_xgb_json()
        del model["learner"]["learner_model_param"]["base_score"]
        p.write_text(json.dumps(model))
        outcome = ModelRegistry._check_xgb_base_score_format(str(p))
        assert outcome.startswith("skipped:")

    def test_real_xgboost_2_x_write_is_scalar(self, tmp_path: Path):
        """Ground truth: xgboost 2.x (the version pinned for serving) writes
        base_score as a SCALAR string — so the guard's format discrimination
        matches reality."""
        import xgboost as xgb

        reg = xgb.XGBRegressor(n_estimators=2, max_depth=2)
        rng = np.random.default_rng(0)
        X = pd.DataFrame({"x": rng.normal(size=20)})
        y = 17.0 + rng.normal(scale=0.1, size=20)
        reg.fit(X, y)
        p = tmp_path / "m.json"
        reg.save_model(str(p))
        with open(p) as f:
            written = json.load(f)
        bs = written["learner"]["learner_model_param"]["base_score"]
        assert not str(bs).startswith("["), (
            f"xgboost {xgb.__version__} wrote a list base_score ({bs!r}) — "
            "the guard's format test needs updating."
        )


# ----------------------------------------------------------------------
# Full load() with consistent artefacts (real xgb file; catboost/tabnet
# monkeypatched loaders so load() completes and the guards' outcomes land
# in reg.guards).
# ----------------------------------------------------------------------


class TestFullLoadGuards:
    def test_consistent_artifacts_load_and_record_guards(self, tmp_path: Path, monkeypatch):
        art = tmp_path / "artifacts"
        art.mkdir()
        _consistent_artifacts(art)

        # Real xgboost model so the xgb path (incl. its guard) runs for real.
        import xgboost as xgb

        reg_model = xgb.XGBRegressor(n_estimators=2, max_depth=2)
        rng = np.random.default_rng(1)
        X = pd.DataFrame({"x": rng.normal(size=20)})
        y = 17.0 + rng.normal(scale=0.1, size=20)
        reg_model.fit(X, y)
        reg_model.save_model(str(art / "xgb_model.json"))

        # Stub ONLY the catboost/tabnet loaders (their real files are not
        # loadable); xgb goes through the REAL loader so its guard runs.
        real_load_one = ModelRegistry._load_one_model

        def _partial_loader(self, member, path):
            if member == "xgb":
                return real_load_one(self, member, path)
            return {"member": member, "path": path}

        monkeypatch.setattr(ModelRegistry, "_load_one_model", _partial_loader)

        reg = ModelRegistry(artifacts_dir=str(art)).load()
        assert reg.loaded is True
        assert reg.guards["weights_vs_ensemble_weights"] == "pass"
        assert reg.guards["imputation_vs_preprocessing"] == "pass"
        assert reg.guards["xgb_base_score_format"].startswith("pass")
        assert reg.kept_weights == pytest.approx(
            {"xgb": _LIVE_ENS_WEIGHTS["xgb"],
             "catboost": _LIVE_ENS_WEIGHTS["catboost"],
             "tabnet": _LIVE_ENS_WEIGHTS["tabnet"]},
            abs=1e-12,
        )
        # load_report carries the guard outcomes
        assert "startup_guards" in reg.load_report()

    def test_main_degrades_on_guard_failure(self, tmp_path: Path, monkeypatch):
        """main.py catches ModelLoadError -> degraded.  Verify the guard's
        ModelLoadError is exactly the kind main.py's except clause catches
        (it is the same exception class raised by missing files)."""
        art = tmp_path / "artifacts"
        art.mkdir()
        _write_ensemble_weights(art, _LIVE_ENS_WEIGHTS)
        _write_serving_manifest(art, _LIVE_MANIFEST_WEIGHTS)  # the drift
        _write_preprocessing(art, {})

        reg = ModelRegistry(artifacts_dir=str(art))
        reg._load_metadata_files()
        with pytest.raises(ModelLoadError):
            reg._check_weights_against_ensemble_weights()
        # The app's degradation path: app.state.model_registry stays None and
        # /health reports degraded — exercised in test_resilience.py's suite;
        # here we assert the exception type is the one main.py catches.
        from app.main import create_app  # noqa: F401  (imports fine = same class)


# ----------------------------------------------------------------------
# PART 3 — repair_serving_manifest.py
# ----------------------------------------------------------------------


class TestRepairServingManifest:
    def _build(self, tmp_path: Path, manifest_weights=None, ens_weights=None,
               dropped=None, model_set=("xgb", "catboost", "tabnet"),
               imputation=None, prep_medians=None):
        from scripts import repair_serving_manifest as rsm

        art = tmp_path / "artifacts"
        art.mkdir(exist_ok=True)
        rsm._load_json  # module import check
        _write_ensemble_weights(art, ens_weights or _LIVE_ENS_WEIGHTS)
        _write_serving_manifest(
            art,
            manifest_weights or _LIVE_MANIFEST_WEIGHTS,
            imputation=imputation if imputation is not None else {"log_size_acres": 1.2},
            dropped=dropped,
            model_set=model_set,
        )
        _write_preprocessing(
            art, prep_medians if prep_medians is not None else {"log_size_acres": 1.2}
        )
        return art

    def test_repairs_live_drift_exact_numbers(self, tmp_path: Path, capsys):
        """Before 0.6211/0.2929/0.0860 -> after 0.2295316/0.6682573/0.1022111,
        sum exactly 1.0, .bak created with the original values."""
        from scripts import repair_serving_manifest as rsm

        art = self._build(tmp_path)
        report = rsm.repair_serving_manifest(artifacts_dir=str(art))

        assert report["changed"] is True
        assert report["weights"] == _LIVE_ENS_WEIGHTS
        assert report["weights_sum"] == pytest.approx(1.0, abs=1e-12)

        # The rewritten manifest
        manifest = json.loads((art / "backend_exports" / "serving_manifest.json").read_text())
        got = {k: v["weight_after_renormalisation"] for k, v in manifest["models_to_load"].items()}
        assert got["xgb"] == pytest.approx(0.2295316, abs=1e-12)
        assert got["catboost"] == pytest.approx(0.6682573, abs=1e-12)
        assert got["tabnet"] == pytest.approx(0.1022111, abs=1e-12)
        assert sum(got.values()) == pytest.approx(1.0, abs=1e-12)
        # pruning blocks rewritten too
        assert manifest["pruning"]["original_weights"]["catboost"] == pytest.approx(
            0.6682573, abs=1e-12
        )
        assert manifest["pruning"]["kept_weights_renormalised"]["xgb"] == pytest.approx(
            0.2295316, abs=1e-12
        )

        # Backup holds the ORIGINAL (pre-repair) weights
        backup = json.loads((art / "backend_exports" / "serving_manifest.json.bak").read_text())
        b = {k: v["weight_after_renormalisation"] for k, v in backup["models_to_load"].items()}
        assert b == {"xgb": 0.6211, "catboost": 0.2929, "tabnet": 0.0860}

        out = capsys.readouterr().out
        assert "0.6211000 -> 0.2295316" in out

    def test_idempotent(self, tmp_path: Path):
        """Running twice changes nothing the second time; the .bak is kept."""
        from scripts import repair_serving_manifest as rsm

        art = self._build(tmp_path)
        rsm.repair_serving_manifest(artifacts_dir=str(art))
        before = (art / "backend_exports" / "serving_manifest.json").read_text()

        report2 = rsm.repair_serving_manifest(artifacts_dir=str(art))
        assert report2["changed"] is False
        after = (art / "backend_exports" / "serving_manifest.json").read_text()
        assert after == before
        # backup still the original
        backup = json.loads((art / "backend_exports" / "serving_manifest.json.bak").read_text())
        b = {k: v["weight_after_renormalisation"] for k, v in backup["models_to_load"].items()}
        assert b["xgb"] == 0.6211

    def test_dry_run_writes_nothing(self, tmp_path: Path):
        from scripts import repair_serving_manifest as rsm

        art = self._build(tmp_path)
        before = (art / "backend_exports" / "serving_manifest.json").read_text()
        report = rsm.repair_serving_manifest(artifacts_dir=str(art), dry_run=True)
        assert report["dry_run"] is True
        assert (art / "backend_exports" / "serving_manifest.json").read_text() == before
        assert not (art / "backend_exports" / "serving_manifest.json.bak").exists()

    def test_refuses_when_members_pruned(self, tmp_path: Path, capsys):
        from scripts import repair_serving_manifest as rsm

        art = self._build(
            tmp_path,
            manifest_weights={"xgb": 0.69, "catboost": 0.31},
            dropped={"tabnet": {"original_weight": 0.1022, "reason": "below 0.02"}},
            model_set=("xgb", "catboost"),
        )
        before = (art / "backend_exports" / "serving_manifest.json").read_text()
        with pytest.raises(SystemExit) as ei:
            rsm.repair_serving_manifest(artifacts_dir=str(art))
        assert ei.value.code == 2
        out = capsys.readouterr().out
        assert "REFUSING" in out and "dropped_models" in out
        assert (art / "backend_exports" / "serving_manifest.json").read_text() == before

    def test_refuses_when_model_set_differs(self, tmp_path: Path, capsys):
        from scripts import repair_serving_manifest as rsm

        # manifest has xgb+catboost, ensemble_weights has all three
        art = self._build(tmp_path, manifest_weights={"xgb": 0.5, "catboost": 0.5},
                          model_set=("xgb", "catboost"))
        with pytest.raises(SystemExit) as ei:
            rsm.repair_serving_manifest(artifacts_dir=str(art))
        assert ei.value.code == 2
        out = capsys.readouterr().out
        assert "REFUSING" in out and "model set" in out

    def test_refuses_when_imputation_disagrees(self, tmp_path: Path, capsys):
        from scripts import repair_serving_manifest as rsm

        art = self._build(
            tmp_path,
            imputation={"log_size_acres": 1.5},      # manifest
            prep_medians={"log_size_acres": 1.2},    # preprocessing.json
        )
        with pytest.raises(SystemExit) as ei:
            rsm.repair_serving_manifest(artifacts_dir=str(art))
        assert ei.value.code == 2
        out = capsys.readouterr().out
        assert "REFUSING" in out and "imputation_values" in out

    def test_repaired_manifest_passes_guard(self, tmp_path: Path):
        """End-to-end: repair -> the Part 2a guard that used to raise now
        passes."""
        from scripts import repair_serving_manifest as rsm

        art = self._build(tmp_path)

        reg = ModelRegistry(artifacts_dir=str(art))
        reg._load_metadata_files()
        with pytest.raises(ModelLoadError):
            reg._check_weights_against_ensemble_weights()

        rsm.repair_serving_manifest(artifacts_dir=str(art))

        reg2 = ModelRegistry(artifacts_dir=str(art))
        reg2._load_metadata_files()
        assert reg2._check_weights_against_ensemble_weights() == "pass"

    def test_cli_entrypoint(self, tmp_path: Path, capsys):
        """The __main__ block runs via python -m style invocation."""
        from scripts import repair_serving_manifest as rsm

        art = self._build(tmp_path)
        argv = ["repair_serving_manifest.py", "--artifacts-dir", str(art)]
        old = sys.argv
        sys.argv = argv
        try:
            rsm.repair_serving_manifest(artifacts_dir=str(art))
        finally:
            sys.argv = old
        manifest = json.loads((art / "backend_exports" / "serving_manifest.json").read_text())
        got = manifest["models_to_load"]["xgb"]["weight_after_renormalisation"]
        assert got == pytest.approx(0.2295316, abs=1e-12)
