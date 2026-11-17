"""Artifact registry degraded-mode tests."""

import json
from pathlib import Path

from app.services.artifact_registry import ArtifactRegistry


def test_registry_degraded_when_empty(tmp_path: Path):
    """With no files, the registry reports degraded mode."""
    reg = ArtifactRegistry(artifacts_dir=str(tmp_path))
    reg.load()
    assert reg.loaded is False
    assert len(reg.missing_files) > 0
    assert reg.model_version is None
    assert reg.data_date is None


def test_registry_loaded_when_files_present(tmp_path: Path):
    """With all expected files present, the registry loads JSON metadata."""
    # Create dummy files for every expected file
    from app.services.artifact_registry import EXPECTED_FILES, JSON_FILES_TO_LOAD

    for fname in EXPECTED_FILES:
        p = tmp_path / fname
        if fname in JSON_FILES_TO_LOAD:
            if fname == "metadata.json":
                p.write_text(
                    json.dumps(
                        {
                            "production_run": "Run A",
                            "created": "2025-01-15 10:00:00",
                        }
                    )
                )
            elif fname == "coverage_rules.json":
                p.write_text(
                    json.dumps(
                        {
                            "COVERAGE_MIN_COUNTY_N": 10,
                            "COVERAGE_MIN_NEARBY_N": 5,
                            "COVERAGE_RADIUS_KM": 50,
                        }
                    )
                )
            elif fname == "ensemble_weights.json":
                p.write_text(
                    json.dumps(
                        {
                            "model_order": ["xgb", "catboost"],
                            "weights": [0.6, 0.4],
                        }
                    )
                )
            elif fname == "feature_list.json":
                p.write_text(json.dumps({"features": ["log_size_acres"]}))
            else:
                p.write_text("{}")
        else:
            p.write_text("dummy")

    reg = ArtifactRegistry(artifacts_dir=str(tmp_path))
    reg.load()
    assert reg.loaded is True
    assert reg.missing_files == []
    assert reg.model_version == "Run A"
    assert reg.data_date == "2025-01-15 10:00:00"
    assert reg.coverage_rules["COVERAGE_MIN_COUNTY_N"] == 10
    assert reg.ensemble_weights["weights"] == [0.6, 0.4]


def test_registry_partial_files_reports_missing(tmp_path: Path):
    """If only some files exist, the registry reports which are missing."""
    (tmp_path / "metadata.json").write_text("{}")
    reg = ArtifactRegistry(artifacts_dir=str(tmp_path))
    reg.load()
    assert reg.loaded is False
    assert "metadata.json" not in reg.missing_files  # present
    assert "xgb_model.json" in reg.missing_files  # absent
