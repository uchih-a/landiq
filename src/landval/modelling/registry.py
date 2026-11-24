"""Model registry — loads the pruned, renormalised ensemble once at startup.

The registry reads ``serving_manifest.json`` (Cell 9.8) to learn which model
files to load and their renormalised post-pruning weights, then loads each
listed model file (XGBoost JSON, CatBoost CBM, optionally TabNet ZIP) and
reconstructs the fitted ``PipelinePreprocessor`` from ``preprocessing.json``
(Cell 8.2).  Lightweight JSON siblings — ``conformal.json`` (Cell 9.1),
``coverage_rules.json`` (Cell 9.9) — and ``error_by_support.csv`` (Cell 9.9)
are read here too so the prediction service gets a single object.

The notebook writes its artefacts under ``models/ensemble/`` with two
sub-directories:

    models/ensemble/                       <- ARTIFACTS_DIR (set via settings)
        xgb_model.json                     <- top-level model files
        catboost_model.cbm
        tabnet_model.zip                   (only if listed in the manifest)
        ensemble_weights.json
        feature_list.json
        preprocessing.json
        metadata.json
        backend_exports/
            serving_manifest.json          <- master file listing what to load
            coverage_rules.json
            error_by_support.csv
        app_exports/
            conformal.json
            oof_predictions.parquet
            test_predictions.parquet
            shap_values.parquet

If any file referenced by the manifest is absent the registry raises a
``ModelLoadError`` whose message names every missing file — the lifespan
hook catches it and the app enters degraded mode (``/health`` reports
``degraded``; ``/api/v1/predict`` returns 503 ``MODEL_NOT_LOADED``).
"""

from __future__ import annotations

import csv
import json
import os
import time
import tracemalloc
from dataclasses import dataclass, field
from typing import Any

from landval.modelling.coverage import TREE_MEMBERS, shap_coverage_from_weights
from landval.modelling.preprocessing import PipelinePreprocessor


class ModelLoadError(Exception):
    """Raised when one or more files referenced by the manifest are missing.

    The message lists every missing file so the operator can copy them all in
    one go rather than iterating.
    """


# Mapping from manifest model key to (loader function attr, default file name).
# The file name is the fallback used when ``models_to_load[key]["file"]`` is a
# bare name rather than an absolute path; the notebook always writes the path
# relative to the ensemble directory so this is only a safety net.
_MODEL_FILES = {
    "xgb": "xgb_model.json",
    "catboost": "catboost_model.cbm",
    "tabnet": "tabnet_model.zip",
}

# Weight consistency tolerance: serving_manifest weights vs ensemble_weights.
_WEIGHTS_TOL = 1e-6
# Imputation consistency tolerance: manifest imputation_values vs the medians
# stored in preprocessing.json["preprocessor"]["medians"].
_IMPUTATION_TOL = 1e-9


@dataclass
class ModelRegistry:
    """Holds the loaded models, preprocessor, conformal q values, and metadata.

    Construct with ``ModelRegistry(artifacts_dir)`` then call ``load()``.
    On success ``loaded`` is ``True`` and every attribute below is populated;
    on failure ``load()`` raises ``ModelLoadError`` with the missing-file list.
    """

    artifacts_dir: str
    loaded: bool = False
    # ---- From serving_manifest.json ----
    serving_manifest: dict[str, Any] = field(default_factory=dict)
    models_to_load: dict[str, Any] = field(default_factory=dict)
    dropped_models: dict[str, Any] = field(default_factory=dict)
    kept_members: list[str] = field(default_factory=list)
    kept_weights: dict[str, float] = field(default_factory=dict)
    feature_list: list[dict[str, Any]] = field(default_factory=list)
    feature_names: list[str] = field(default_factory=list)
    categorical_features: list[str] = field(default_factory=list)
    numeric_features: list[str] = field(default_factory=list)
    imputation_values: dict[str, float] = field(default_factory=dict)
    category_levels: dict[str, list[str]] = field(default_factory=dict)
    # ---- From preprocessing.json ----
    preprocessing: dict[str, Any] = field(default_factory=dict)
    preprocessor: PipelinePreprocessor | None = None
    tabnet_target: dict[str, float] = field(default_factory=dict)
    train_median_log: float | None = None
    # ---- From conformal.json ----
    conformal: dict[str, Any] = field(default_factory=dict)
    conformal_q_by_level: dict[float, float] = field(default_factory=dict)
    n_calibration_rows: int = 0
    # ---- From coverage_rules.json ----
    coverage_rules: dict[str, Any] = field(default_factory=dict)
    error_by_support: list[dict[str, Any]] = field(default_factory=list)
    # ---- From explain_spec.md (Cell 9.10) ----
    # The file is documentation for the app; the rule itself (effect = exp(s) - 1)
    # is hardcoded in explain.py.  We only check the file exists so the
    # operator gets a clear "missing file" message if they forgot to copy it.
    explain_spec_present: bool = False
    explain_spec_path: str = ""
    # ---- Loaded model objects ----
    models: dict[str, Any] = field(default_factory=dict)
    # ---- Diagnostics ----
    load_time_s: float = 0.0
    memory_mb: float = 0.0
    missing_files: list[str] = field(default_factory=list)
    # Startup-guard outcomes ("pass" | "skipped:<reason>") for the load report.
    guards: dict[str, str] = field(default_factory=dict)

    # ------------------------------------------------------------------ paths
    def _path(self, *parts: str) -> str:
        return os.path.join(self.artifacts_dir, *parts)

    def _read_json(self, rel_path: str) -> dict[str, Any]:
        path = self._path(rel_path)
        if not os.path.exists(path):
            self.missing_files.append(rel_path)
            return {}
        with open(path) as f:
            return json.load(f)

    def _read_csv(self, rel_path: str) -> list[dict[str, Any]]:
        path = self._path(rel_path)
        if not os.path.exists(path):
            self.missing_files.append(rel_path)
            return []
        with open(path, newline="") as f:
            return list(csv.DictReader(f))

    # ------------------------------------------------------------------ load
    def load(self) -> ModelRegistry:
        """Load every artefact the prediction service needs.

        Raises ``ModelLoadError`` if any file referenced by the manifest is
        missing.  The lifespan hook catches this and the app runs in degraded
        mode.
        """
        self.missing_files = []
        t0 = time.perf_counter()
        tracemalloc.start()
        # reset_peak() makes get_traced_memory()[1] report the peak *during*
        # this load (not since the process started).
        tracemalloc.reset_peak()
        try:
            self._load_metadata_files()
            # If the manifest itself is missing there is no point continuing.
            if not self.serving_manifest:
                raise ModelLoadError(self._missing_message())
            self._load_models_from_manifest()
            self._build_preprocessor()
            self._load_coverage_and_errors()
            # Startup consistency guards (weights / imputation / XGB format).
            # These run AFTER the files load so a failure surfaces the guard's
            # specific message rather than a generic missing-file error.
            self.guards["weights_vs_ensemble_weights"] = self._check_weights_against_ensemble_weights()
            self.guards["imputation_vs_preprocessing"] = self._check_imputation_against_preprocessing()
            # (the XGB base_score guard runs inside _load_one_model and
            # records its outcome on self.guards["xgb_base_score_format"])
            # Any missing file recorded along the way becomes a hard error.
            if self.missing_files:
                raise ModelLoadError(self._missing_message())
            self.loaded = True
        finally:
            _current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            self.load_time_s = round(time.perf_counter() - t0, 3)
            # Peak traced memory in MB; this captures the model-file load
            # (XGBoost JSON, CatBoost CBM, optional TabNet ZIP) plus the JSON
            # metadata.  It does not count the FastAPI app itself.
            self.memory_mb = round(peak / (1024 * 1024), 1)
        return self

    # ------------------------------------------------------------------ steps
    def _load_metadata_files(self) -> None:
        """Read the four lightweight JSON files (manifest, preprocessing, conformal)."""
        self.serving_manifest = self._read_json("backend_exports/serving_manifest.json")
        self.preprocessing = self._read_json("preprocessing.json")
        self.conformal = self._read_json("app_exports/conformal.json")

        if self.serving_manifest:
            self.models_to_load = self.serving_manifest.get("models_to_load", {})
            self.dropped_models = self.serving_manifest.get("dropped_models", {})
            self.kept_members = list(self.models_to_load.keys())
            self.kept_weights = {
                k: float(v["weight_after_renormalisation"]) for k, v in self.models_to_load.items()
            }
            self.feature_list = self.serving_manifest.get("feature_list", [])
            self.feature_names = [f["name"] for f in self.feature_list]
            self.categorical_features = [
                f["name"] for f in self.feature_list if f.get("type") == "categorical"
            ]
            self.numeric_features = [
                f["name"] for f in self.feature_list if f.get("type") == "numeric"
            ]
            self.imputation_values = {
                k: float(v) for k, v in self.serving_manifest.get("imputation_values", {}).items()
            }
            self.category_levels = self.serving_manifest.get("category_levels", {})

        if self.preprocessing:
            self.tabnet_target = self.preprocessing.get("tabnet_target", {})
            self.train_median_log = self.preprocessing.get("train_median_log")

        if self.conformal:
            self.n_calibration_rows = int(self.conformal.get("n_calibration_rows", 0))
            # conformal.json["levels"] is a list of {level, q_log_scale, ...}
            self.conformal_q_by_level = {
                float(r["level"]): float(r["q_log_scale"]) for r in self.conformal.get("levels", [])
            }

    def _load_models_from_manifest(self) -> None:
        """Load each model file listed in ``models_to_load``.

        The manifest stores absolute paths (``models/ensemble/xgb_model.json``)
        but the backend reads from ``ARTIFACTS_DIR`` (which may be ``./artifacts``
        in dev or ``/app/artifacts`` in the container).  We resolve the file
        name from the manifest path and look for it directly under
        ``artifacts_dir`` — the operator copies the ensemble directory contents
        into ``ARTIFACTS_DIR`` (per the artifacts README).
        """
        for member in self.kept_members:
            entry = self.models_to_load.get(member, {})
            manifest_path = entry.get("file", "")
            # Strip directory components — the manifest path is
            # "models/ensemble/xgb_model.json"; we want "xgb_model.json".
            file_name = os.path.basename(manifest_path) or _MODEL_FILES.get(member, "")
            actual_path = self._path(file_name)
            if not os.path.exists(actual_path):
                self.missing_files.append(file_name)
                continue
            self.models[member] = self._load_one_model(member, actual_path)

    def _load_one_model(self, member: str, path: str) -> Any:
        """Load a single model file.  Imports are local so missing optional
        libraries (pytorch_tabnet) do not break startup when TabNet is pruned."""
        if member == "xgb":
            import xgboost as xgb

            self.guards["xgb_base_score_format"] = self._check_xgb_base_score_format(path)
            model = xgb.XGBRegressor()
            model.load_model(path)
            # Re-apply enable_categorical exactly as Cell 8.3 does, so a
            # category-dtype frame (transform_xgb's output) keeps working.
            model.set_params(enable_categorical=True, tree_method="hist")
            return model
        if member == "catboost":
            from catboost import CatBoostRegressor

            model = CatBoostRegressor()
            model.load_model(path)
            return model
        if member == "tabnet":
            from pytorch_tabnet.tab_model import TabNetRegressor

            model = TabNetRegressor()
            model.load_model(path)
            return model
        raise ModelLoadError(f"unknown ensemble member '{member}' in serving_manifest")

    # ------------------------------------------------------------------ guards
    def _check_weights_against_ensemble_weights(self) -> None:
        """Guard (a): serving_manifest weights must equal ensemble_weights.json.

        ``serving_manifest.json``'s ``models_to_load[*].weight_after_renormalisation``
        is what the backend serves with; ``ensemble_weights.json`` is what the
        notebook's production run solved (and the file that reproduces the
        stored ensemble predictions).  When no members were pruned the two must
        agree — a drift means every served ensemble prediction is silently
        wrong.  (This exact failure shipped live: manifest weights
        0.6211/0.2929/0.0860 vs ensemble_weights.json 0.2295/0.6683/0.1022.)

        Skipped (no error) when ``ensemble_weights.json`` is absent or when
        members were pruned (``dropped_models`` non-empty) — after pruning the
        survivors are legitimately renormalised away from the originals.
        Raises ``ModelLoadError`` when any kept weight differs from
        ``weights[model_order.index(k)]`` by more than ``_WEIGHTS_TOL``.
        Returns the guard outcome ("pass" | "skipped:<reason>") for the load
        report.
        """
        path = self._path("ensemble_weights.json")
        if not os.path.exists(path):
            return "skipped:ensemble_weights.json absent"
        with open(path) as f:
            ew = json.load(f)
        if not ew:
            return "skipped:ensemble_weights.json empty"
        if self.dropped_models:
            return "skipped:members were pruned (dropped_models non-empty)"
        model_order = list(ew.get("model_order", []))
        weights = list(ew.get("weights", []))
        if not model_order or len(model_order) != len(weights):
            raise ModelLoadError(
                "ensemble_weights.json is malformed (model_order/weights length "
                f"mismatch: {len(model_order)} vs {len(weights)}) at {path}"
            )
        model_order = list(ew.get("model_order", []))
        weights = list(ew.get("weights", []))
        if not model_order or len(model_order) != len(weights):
            raise ModelLoadError(
                "ensemble_weights.json is malformed (model_order/weights length "
                f"mismatch: {len(model_order)} vs {len(weights)}) at {path}"
            )
        bad: list[tuple[str, float, float]] = []
        for k in self.kept_members:
            if k not in model_order:
                continue
            expected = float(weights[model_order.index(k)])
            got = float(self.kept_weights.get(k, float("nan")))
            if abs(got - expected) > _WEIGHTS_TOL:
                bad.append((k, got, expected))
        if bad:
            manifest_vec = [round(self.kept_weights.get(k, float("nan")), 6) for k in model_order]
            ens_vec = [round(float(w), 6) for w in weights]
            lines = [
                "ModelRegistry: serving_manifest weights do not match "
                "ensemble_weights.json (no members were pruned, so they must "
                "be identical).",
                f"  serving_manifest weight_after_renormalisation : {manifest_vec}",
                f"  ensemble_weights.json weights                 : {ens_vec}",
                "Diverging members: "
                + ", ".join(f"{k}: manifest={g:.6f} vs ensemble={e:.6f}" for k, g, e in bad),
                "Fix: run scripts/repair_serving_manifest.py to rewrite the "
                "manifest weights from ensemble_weights.json.",
            ]
            raise ModelLoadError("\n".join(lines))
        return "pass"

    def _check_imputation_against_preprocessing(self) -> None:
        """Guard (b): manifest imputation_values vs preprocessing.json medians.

        ``serving_manifest.json["imputation_values"]`` (Cell 9.8: ``{c: float(v)
        for c, v in _prep_prod.medians_.items()}``) and
        ``preprocessing.json["preprocessor"]["medians"]`` (Cell 8.2:
        ``PRODUCTION_RUN["prep"].to_dict()["medians"]``) are serialised from the
        SAME fitted preprocessor, so any difference means the manifest and the
        preprocessing file came from different runs — the backend would impute
        with one set of medians while the models were trained on another.

        Raises ``ModelLoadError`` when any shared key differs by more than
        ``_IMPUTATION_TOL``.  When neither file carries the values (no
        ``imputation_values`` in the manifest or no ``medians`` in the
        preprocessor dict), the check is skipped — that is reported by the
        caller in the load report, not an error.  Returns the guard outcome
        ("pass" | "skipped:<reason>") for the load report.
        """
        prep_dict = (self.preprocessing or {}).get("preprocessor") or {}
        prep_medians = prep_dict.get("medians") if isinstance(prep_dict, dict) else None
        if not self.imputation_values or not prep_medians:
            return "skipped:imputation_values or preprocessing medians not present"
        bad: list[tuple[str, float, float]] = []
        for col, manifest_v in self.imputation_values.items():
            if col not in prep_medians:
                continue
            prep_v = float(prep_medians[col])
            if abs(float(manifest_v) - prep_v) > _IMPUTATION_TOL:
                bad.append((col, float(manifest_v), prep_v))
        if bad:
            lines = [
                "ModelRegistry: serving_manifest imputation_values disagree "
                "with preprocessing.json preprocessor medians (>1e-9):",
            ]
            for col, m_v, p_v in bad:
                lines.append(f"  - {col}: manifest={m_v!r} vs preprocessing={p_v!r}")
            lines.append(
                "The manifest and preprocessing.json were exported from "
                "different preprocessor states. Re-run Notebook 3 Cell 9.8 "
                "(and Cell 8.2) so both come from the same production run."
            )
            raise ModelLoadError("\n".join(lines))
        return "pass"

    @staticmethod
    def _check_xgb_base_score_format(path: str) -> None:
        """Guard (c): xgb_model.json written by xgboost>=3 must not be read by
        xgboost 2.x.

        xgboost 3.x serialises ``learner.learner_model_param.base_score`` as a
        LIST (``"[35.1]"``-style); xgboost 2.x parses that string as 0.5 —
        silently shifting every XGBoost prediction by ``base_score - 0.5`` on
        the log scale.  When the file's base_score starts with ``[`` and the
        installed xgboost major version is < 3, raise ``ModelLoadError``
        pointing at ``scripts/fix_xgb_base_score.py``.  Returns the guard
        outcome ("pass" | "skipped:<reason>") for the load report.
        """
        import json as _json

        import xgboost as _xgb

        try:
            with open(path) as f:
                model_json = _json.load(f)
        except (OSError, _json.JSONDecodeError) as e:
            raise ModelLoadError(
                f"ModelRegistry: cannot read xgb model file {path!r} as JSON: {e}"
            ) from e
        base_score = (
            model_json.get("learner", {}).get("learner_model_param", {}).get("base_score")
        )
        if base_score is None:
            return "skipped:no learner_model_param.base_score in xgb_model.json"
        if not str(base_score).lstrip().startswith("["):
            return "pass (scalar base_score, xgboost 2.x-safe)"
        major = int(str(_xgb.__version__).split(".")[0])
        if major < 3:
            raise ModelLoadError(
                "ModelRegistry: xgb_model.json was written by xgboost>=3 (its "
                "learner.learner_model_param.base_score is a list: "
                f"{base_score!r}), but the installed xgboost is "
                f"{_xgb.__version__} (<3). xgboost 2.x reads that value as 0.5 "
                "and silently shifts EVERY XGBoost prediction by "
                "(base_score - 0.5) on the log scale. Fix the file with "
                "scripts/fix_xgb_base_score.py (or upgrade xgboost to >=3), "
                "then reload."
            )
        return f"pass (list base_score under xgboost {_xgb.__version__} >=3)"

    def _build_preprocessor(self) -> None:
        """Reconstruct the fitted PipelinePreprocessor from preprocessing.json."""
        if not self.preprocessing:
            return
        prep_dict = self.preprocessing.get("preprocessor")
        if prep_dict is None:
            self.missing_files.append("preprocessing.json:preprocessor")
            return
        self.preprocessor = PipelinePreprocessor.from_dict(prep_dict)

    def _load_coverage_and_errors(self) -> None:
        """Read coverage_rules.json + error_by_support.csv (Cell 9.9) and
        check for explain_spec.md (Cell 9.10)."""
        self.coverage_rules = self._read_json("backend_exports/coverage_rules.json")
        self.error_by_support = self._read_csv("backend_exports/error_by_support.csv")
        # explain_spec.md (Cell 9.10) — documentation file for the app.
        # The rule itself (effect = exp(s) - 1) is hardcoded in explain.py
        # from Cell 9.10's source; we only check the file exists so the
        # operator gets a clear message if they forgot to copy it.
        spec_path = self._path("backend_exports", "explain_spec.md")
        self.explain_spec_path = spec_path
        self.explain_spec_present = os.path.exists(spec_path)
        if not self.explain_spec_present:
            # Soft warning — explain_spec.md is documentation; its absence
            # doesn't break the live explanation (the rule is hardcoded),
            # but the operator should copy it for the app's reference.
            # Don't add to missing_files (which raises ModelLoadError) —
            # just log a warning via the loaded flag.
            pass

    # ------------------------------------------------------------------ utils
    def _missing_message(self) -> str:
        """Compose a clear error listing every missing file."""
        if not self.missing_files:
            return "ModelRegistry.load() failed for an unknown reason."
        lines = [
            "ModelRegistry: cannot load the production ensemble — the following "
            "artefact file(s) are missing from ARTIFACTS_DIR "
            f"({self.artifacts_dir!r}):",
        ]
        for f in sorted(set(self.missing_files)):
            lines.append(f"  - {f}")
        lines.append(
            "Copy the contents of models/ensemble/ from Notebook 3 into "
            "ARTIFACTS_DIR (see artifacts/README.md)."
        )
        return "\n".join(lines)

    # ------------------------------------------------------------------ views
    @property
    def model_order(self) -> list[str]:
        """The order in which the manifest lists the kept members.

        Cell 8.3 iterates ``stack["model_order"]`` (which is the original
        ``MODEL_ORDER = ["xgb", "catboost", "tabnet"]``) and pairs each entry
        with the corresponding weight via positional index.  Because we drop
        pruned members from the same list, the surviving members keep their
        original relative order — the renormalised weights align with the
        survivors exactly as Cell 9.8 computes them.
        """
        return self.kept_members

    @property
    def weights_array(self):
        """Renormalised weights in ``model_order`` order, as a numpy array."""
        import numpy as np

        return np.asarray([self.kept_weights[k] for k in self.model_order], dtype=float)

    def conformal_q(self, level: float) -> float | None:
        """Return the conformal q for ``level`` if it is one of the exported
        levels (0.50 / 0.80 / 0.90).  Returns ``None`` for any other level —
        the prediction service recomputes it from ``oof_predictions.parquet``
        using Cell 9.1's ``conformal_q_for`` formula in that case.
        """
        return self.conformal_q_by_level.get(float(level))

    # ------------------------------------------------------------------ shap
    @property
    def tree_members_loaded(self) -> list[str]:
        """Which loaded members are tree-based (shap.TreeExplainer can explain).

        TabNet is excluded by construction — it's a neural net, not a tree
        model.  Returns the subset of ``kept_members`` in
        ``TREE_MEMBERS`` ("xgb", "catboost").
        """
        return [m for m in self.kept_members if m in TREE_MEMBERS]

    def recomputed_shap_coverage(self) -> dict[str, Any]:
        """Recompute the SHAP-explained / unexplained shares from whichever
        members actually got loaded (post-pruning).

        The notebook's ``manifest.json:ensemble_shap_coverage`` records the
        shares for the original (pre-pruning) weights; after Cell 9.8 prunes
        members below weight 0.02 and renormalises the survivors, the shares
        change.  This method returns the live values for the loaded set:

            tree_share_explained_by_shap = w_xgb + w_cat   (sum of tree weights)
            tabnet_share_not_covered      = w_tab           (0 if pruned)

        When TabNet was pruned (typical case), ``tree_share`` is 1.0 and the
        SHAP values explain the entire ensemble.  When TabNet was kept, the
        tree share covers only its fraction; the TabNet fraction is the
        unexplained residual.

        The computation itself lives in the ONE shared function
        (``landval.modelling.coverage.shap_coverage_from_weights``, P6b) so
        the registry, the live /predict coverage block and
        /model/explainability can never drift apart; this method keeps
        the registry's note.
        """
        cov = shap_coverage_from_weights(self.kept_members, self.kept_weights)
        cov["note"] = (
            "recomputed from the loaded ensemble's renormalised weights "
            "(serving_manifest.json, post-pruning); the manifest's "
            "ensemble_shap_coverage records the pre-pruning values."
        )
        return cov

    def load_report(self) -> dict[str, Any]:
        """A small JSON-friendly summary of what was loaded, for /meta or logs."""
        return {
            "loaded": self.loaded,
            "kept_members": self.kept_members,
            "kept_weights_renormalised": self.kept_weights,
            "dropped_models": list(self.dropped_models.keys()),
            "n_features": len(self.feature_names),
            "n_calibration_rows": self.n_calibration_rows,
            "conformal_levels": sorted(self.conformal_q_by_level.keys()),
            "load_time_s": self.load_time_s,
            "memory_mb": self.memory_mb,
            "missing_files": self.missing_files,
            "startup_guards": self.guards,
        }
