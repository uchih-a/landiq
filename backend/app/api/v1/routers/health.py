"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])

APP_VERSION = "0.1.0"


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    """Liveness + readiness probe.

    Returns ``status: ok`` when all artifacts are loaded **and** the model
    registry successfully loaded the ensemble (so ``/api/v1/predict`` is
    usable).  ``degraded`` covers two cases:

    1. The ``ArtifactRegistry`` (B0) found a missing top-level file
       (``xgb_model.json``, ``preprocessing.json``, …).
    2. The ``ModelRegistry`` (this phase) raised ``ModelLoadError`` —
       typically because ``serving_manifest.json`` or one of the model
       files it lists is missing, or because the feature pipeline's
       ``scoring_params.json`` / ``reference_data.json`` /
       ``feature_manifest.json`` are absent.

    In both cases the app still starts so ``/docs`` and the test suite
    work without the large model files.
    """
    registry = request.app.state.registry
    model_reg = getattr(request.app.state, "model_registry", None)
    model_loaded = bool(model_reg) and getattr(model_reg, "loaded", False)
    pred_service = getattr(request.app.state, "prediction_service", None)
    fully_ok = registry.loaded and model_loaded and pred_service is not None
    return HealthResponse(
        status="ok" if fully_ok else "degraded",
        artifacts_loaded=fully_ok,
        version=APP_VERSION,
    )
