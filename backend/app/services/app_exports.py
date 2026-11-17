"""App-exports registry — loads Notebook 3 Phase 9's static export files once
at startup so the read-only data endpoints (Market Insights, Model
Performance, Explainability, Deal Finder) can serve them without re-reading
disk on every request.

Follows the same pattern as B0's ``ArtifactRegistry`` (load-once at startup,
tolerate per-file missing, ``loaded`` flag per file) but does **not** touch
the existing registry's ``EXPECTED_FILES`` list — that list gates the model
registry (B2) and its tests, and the app-export files are an independent
concern.  When a specific export file is missing the corresponding endpoint
returns 503 ``DATA_UNAVAILABLE`` (not a 500) — see
``app.core.exceptions.AppError``.

File layout under ``ARTIFACTS_DIR/app_exports/`` (Cell 9.7's manifest lists
every file with its byte size, row count, columns and dtypes):

    conformal.json                 <- loaded by B2's ModelRegistry
    oof_predictions.parquet         <- loaded lazily by B2's PredictionService
    test_predictions.parquet        <- loaded lazily by B2's PredictionService
    metrics_table.csv               <- loaded here (Model Performance tab)
    metrics.json                    <- loaded here (Model Performance tab)
    feature_evaluation.csv          <- loaded here (Model Performance tab)
    shap_values.parquet             <- NOT loaded here (only used by B2's
                                       per-listing lookup; not exposed by
                                       these read-only endpoints)
    shap_global.csv                 <- loaded here (Explainability tab)
    feature_importance.csv          <- loaded here (Explainability tab)
    feature_labels.json             <- loaded here (Explainability tab)
    county_summary.csv              <- loaded here (Market Insights tab)
    listings_scored.parquet         <- loaded here (Deal Finder tab)
    manifest.json                   <- loaded here (used by every endpoint to
                                       report row counts / column lists in
                                       /meta-style introspection; also
                                       guards the "is this file supposed to
                                       exist?" check)
    APP_EXPORTS_README.md           <- NOT loaded (documentation only)
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from app.core.logging import get_logger

logger = get_logger("app.app_exports")

# Every file Cell 9.7 lists in its APP_EXPORT_FILES table, minus the ones
# loaded elsewhere (B2's ModelRegistry / PredictionService) and the
# documentation files.  Mapping is file name -> (loader, attribute name).
# Loaders return either a DataFrame, a dict, or None (if the file is
# missing).  Per-file errors are caught and recorded in ``missing_files``.
APP_EXPORT_FILES_TO_LOAD: list[tuple[str, str]] = [
    ("manifest.json", "manifest"),
    ("metrics.json", "metrics_json"),
    ("feature_labels.json", "feature_labels_json"),
    ("county_summary.csv", "county_summary_df"),
    ("metrics_table.csv", "metrics_table_df"),
    ("feature_evaluation.csv", "feature_evaluation_df"),
    ("shap_global.csv", "shap_global_df"),
    ("feature_importance.csv", "feature_importance_df"),
    ("listings_scored.parquet", "listings_scored_df"),
    ("oof_predictions.parquet", "oof_predictions_df"),
    ("test_predictions.parquet", "test_predictions_df"),
]


@dataclass
class AppExportsRegistry:
    """Loads and caches the Phase 9 app-export files.

    Each file is loaded independently — a missing or unreadable file sets
    its attribute to ``None`` and is recorded in ``missing_files`` but does
    not block the others.  This is the same degraded-mode pattern as B0's
    ``ArtifactRegistry``: the app still starts, and the corresponding
    endpoint returns 503 ``DATA_UNAVAILABLE`` when its data is absent.
    """

    artifacts_dir: str
    # ---- Per-file loaded state ----
    manifest: dict[str, Any] | None = None
    metrics_json: dict[str, Any] | None = None
    feature_labels_json: dict[str, Any] | None = None
    county_summary_df: pd.DataFrame | None = None
    metrics_table_df: pd.DataFrame | None = None
    feature_evaluation_df: pd.DataFrame | None = None
    shap_global_df: pd.DataFrame | None = None
    feature_importance_df: pd.DataFrame | None = None
    listings_scored_df: pd.DataFrame | None = None
    oof_predictions_df: pd.DataFrame | None = None
    test_predictions_df: pd.DataFrame | None = None
    # ---- Diagnostics ----
    missing_files: list[str] = field(default_factory=list)
    loaded_files: list[str] = field(default_factory=list)
    load_errors: dict[str, str] = field(default_factory=dict)

    @property
    def app_exports_dir(self) -> str:
        return os.path.join(self.artifacts_dir, "app_exports")

    def _path(self, name: str) -> str:
        return os.path.join(self.app_exports_dir, name)

    def load(self) -> AppExportsRegistry:
        """Load every Phase 9 app-export file that is present on disk.

        Missing files are recorded in ``missing_files`` but do not raise;
        the corresponding attribute stays ``None`` and the endpoint returns
        503 ``DATA_UNAVAILABLE`` when queried.
        """
        self.missing_files = []
        self.loaded_files = []
        self.load_errors = {}

        for file_name, attr in APP_EXPORT_FILES_TO_LOAD:
            path = self._path(file_name)
            if not os.path.exists(path):
                self.missing_files.append(file_name)
                continue
            try:
                value = self._load_one(file_name, path)
            except (json.JSONDecodeError, pd.errors.ParserError, OSError, ValueError) as e:
                self.load_errors[file_name] = f"{type(e).__name__}: {e}"
                self.missing_files.append(f"{file_name} (unreadable)")
                continue
            setattr(self, attr, value)
            self.loaded_files.append(file_name)

        if self.loaded_files:
            logger.info(
                "app_exports_loaded",
                loaded=self.loaded_files,
                missing=self.missing_files,
                errors=self.load_errors or None,
            )
        else:
            logger.warning(
                "app_exports_empty",
                missing=self.missing_files,
                app_exports_dir=self.app_exports_dir,
            )
        return self

    def _load_one(self, file_name: str, path: str) -> Any:
        """Dispatch on file extension."""
        if file_name.endswith(".json"):
            with open(path) as f:
                return json.load(f)
        if file_name.endswith(".csv"):
            return pd.read_csv(path)
        if file_name.endswith(".parquet"):
            return pd.read_parquet(path)
        raise ValueError(f"unknown file type: {file_name}")

    # ------------------------------------------------------------------ views
    def has(self, attr: str) -> bool:
        """True if the named attribute (e.g. ``county_summary_df``) loaded."""
        return getattr(self, attr, None) is not None

    def require(self, attr: str, file_name: str) -> Any:
        """Return the attribute or raise ``AppError(503 DATA_UNAVAILABLE)``.

        Used by routers to short-circuit when a specific export is missing.
        """
        from app.core.exceptions import AppError

        value = getattr(self, attr, None)
        if value is None:
            error = self.load_errors.get(file_name)
            details = {
                "file": f"app_exports/{file_name}",
                "loaded_files": self.loaded_files,
            }
            if error:
                details["error"] = error
            raise AppError(
                code="DATA_UNAVAILABLE",
                message=(
                    f"The export file app_exports/{file_name} is not available. "
                    "Copy the contents of models/ensemble/app_exports/ from "
                    "Notebook 3 Phase 9 into ARTIFACTS_DIR/app_exports/ and restart."
                ),
                status_code=503,
                details=details,
            )
        return value

    def load_report(self) -> dict[str, Any]:
        """JSON-friendly summary for /meta-style introspection."""
        return {
            "loaded_files": self.loaded_files,
            "missing_files": self.missing_files,
            "load_errors": self.load_errors,
            "manifest_present": self.manifest is not None,
            "listings_scored_rows": (
                int(len(self.listings_scored_df)) if self.listings_scored_df is not None else None
            ),
        }
