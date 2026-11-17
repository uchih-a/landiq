"""Artifact registry: checks for expected files at startup, loads metadata.

The registry runs in the FastAPI lifespan hook.  If the expected files
are present it loads the lightweight JSON metadata (model version, coverage
thresholds, ensemble weights).  If any are missing the app enters
"degraded" mode: ``/health`` returns ``status: degraded`` and
``artifacts_loaded: false``, and ``/meta`` returns ``null`` fields.
The app still starts so that CI tests and ``/docs`` work without the
large model files.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

from app.core.logging import get_logger

logger = get_logger("app.registry")

# Files expected inside the artifacts directory.  The large model files
# (*.json, *.cbm, *.zip) are checked for existence but not loaded into
# memory — they are opened lazily by the prediction service.
EXPECTED_FILES = [
    "xgb_model.json",
    "catboost_model.cbm",
    "tabnet_model.zip",
    "ensemble_weights.json",
    "feature_list.json",
    "preprocessing.json",
    "metadata.json",
    "coverage_rules.json",
]

# Lightweight JSON files loaded at startup (small enough to hold in memory)
JSON_FILES_TO_LOAD = [
    "metadata.json",
    "coverage_rules.json",
    "ensemble_weights.json",
    "feature_list.json",
]


@dataclass
class ArtifactRegistry:
    """Holds the loaded artifact metadata and the load status."""

    artifacts_dir: str
    loaded: bool = False
    missing_files: list = field(default_factory=list)
    metadata: dict[str, Any] | None = None
    coverage_rules: dict[str, Any] | None = None
    ensemble_weights: dict[str, Any] | None = None
    feature_list: dict[str, Any] | None = None

    def load(self) -> None:
        """Check for expected files and load the lightweight JSON metadata."""
        self.missing_files = []
        for fname in EXPECTED_FILES:
            path = os.path.join(self.artifacts_dir, fname)
            if not os.path.exists(path):
                self.missing_files.append(fname)

        if self.missing_files:
            self.loaded = False
            logger.warning(
                "artifacts_missing",
                missing=self.missing_files,
                artifacts_dir=self.artifacts_dir,
                mode="degraded",
            )
            return

        # All expected files present — load the JSON ones
        self.loaded = True
        for fname in JSON_FILES_TO_LOAD:
            path = os.path.join(self.artifacts_dir, fname)
            try:
                with open(path) as f:
                    data = json.load(f)
                attr = fname.replace(".json", "").replace("-", "_")
                # Map file names to attribute names
                attr_map = {
                    "metadata": "metadata",
                    "coverage_rules": "coverage_rules",
                    "ensemble_weights": "ensemble_weights",
                    "feature_list": "feature_list",
                }
                setattr(self, attr_map.get(attr, attr), data)
            except (json.JSONDecodeError, OSError) as e:
                logger.error(
                    "artifact_load_failed",
                    file=fname,
                    error=str(e),
                )
                # Don't mark as fully loaded if a JSON parse fails
                self.loaded = False
                self.missing_files.append(f"{fname} (unreadable)")

        if self.loaded:
            logger.info(
                "artifacts_loaded",
                files=len(EXPECTED_FILES),
                artifacts_dir=self.artifacts_dir,
            )

    @property
    def model_version(self) -> str | None:
        if self.metadata:
            return self.metadata.get("production_run")
        return None

    @property
    def data_date(self) -> str | None:
        if self.metadata:
            return self.metadata.get("created")
        return None
