"""Modelling layer — ensemble loading, prediction, live explanation, comparables.

Public surface:

    PipelinePreprocessor     — verbatim from Notebook 3 Cell 3.2
    ModelRegistry            — loads serving_manifest.json + the pruned ensemble
    ModelLoadError           — raised when any manifest-referenced file is missing
    PredictionService        — Cell 8.3 + Cell 9.1 inference for one map point
    PredictionResult         — dataclass returned by PredictionService.predict
    CoverageWarning          — low-support flag returned alongside every prediction
    LiveExplanationService   — per-request SHAP driver breakdown (Cell 9.4 + 9.10)
    LiveExplanationResult    — dataclass returned by LiveExplanationService.explain
    DriverContribution       — one feature's contribution to the prediction
    ComparablesService       — nearby-listing comparables from listings_scored.parquet
    ComparableListing        — one comparable listing row
"""

from landval.modelling.comparables import ComparableListing, ComparablesService
from landval.modelling.explain import (
    DriverContribution,
    LiveExplanationResult,
    LiveExplanationService,
)
from landval.modelling.predict import CoverageWarning, PredictionResult, PredictionService
from landval.modelling.preprocessing import PipelinePreprocessor
from landval.modelling.registry import ModelLoadError, ModelRegistry

__all__ = [
    "PipelinePreprocessor",
    "ModelRegistry",
    "ModelLoadError",
    "PredictionService",
    "PredictionResult",
    "CoverageWarning",
    "LiveExplanationService",
    "LiveExplanationResult",
    "DriverContribution",
    "ComparablesService",
    "ComparableListing",
]
