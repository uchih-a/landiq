"""Metadata endpoint — model version, data date, coverage thresholds,
the KSh↔USD FX block, the flag window and the methodology copy.

P8b: the FX block has NO default rate — ``fx`` is null until the operator
sets ``FX_KSH_PER_USD`` (the frontend then disables its USD toggle instead
of guessing).  ``flag_definition`` (the flagged-listing percentile window)
and ``methodology`` (sources note / cleaning steps / feature groups) come
from the canonical constants — single backend definitions the UI renders.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.schemas.canonical import (
    FLAG_LOWER_PCT,
    FLAG_UPPER_PCT,
    METHODOLOGY,
)
from app.schemas.health import (
    CoverageThresholds,
    FlagDefinition,
    FxBlock,
    MetaResponse,
    MethodologyBlock,
)

router = APIRouter(tags=["meta"])


@router.get("/meta", response_model=MetaResponse)
async def meta(request: Request) -> MetaResponse:
    """Return lightweight artifact metadata + FX + canonical copy blocks.

    When artifacts are not loaded (degraded mode) the model_version /
    data_date / coverage / ensemble_weights fields are ``null``.  The FX
    block comes from settings (env), NOT artifacts — but there is no
    default rate in code, so it too is ``null`` until the operator
    configures one.  ``flag_definition`` and ``methodology`` are code
    constants and are always served.
    """
    reg = request.app.state.registry
    settings = request.app.state.settings

    coverage = None
    if reg.coverage_rules:
        coverage = CoverageThresholds(
            min_county_n=reg.coverage_rules.get("COVERAGE_MIN_COUNTY_N", 10),
            min_nearby_n=reg.coverage_rules.get("COVERAGE_MIN_NEARBY_N", 5),
            radius_km=reg.coverage_rules.get("COVERAGE_RADIUS_KM", 50),
        )

    # ---- FX (P8b): from settings only; NO default rate in code. ----
    rate = getattr(settings, "fx_ksh_per_usd", None)
    fx = None
    if rate is not None and rate > 0:
        as_of = getattr(settings, "fx_as_of", "") or None
        source = getattr(settings, "fx_source", "") or None
        fx = FxBlock(ksh_per_usd=float(rate), as_of=as_of, source=source)

    # ---- Canonical copy blocks (P7b/P8b). ----
    flag_definition = FlagDefinition(lower_pct=FLAG_LOWER_PCT, upper_pct=FLAG_UPPER_PCT)
    methodology = MethodologyBlock(
        sources_note=METHODOLOGY.get("sources_note"),
        cleaning_steps=METHODOLOGY.get("cleaning_steps"),
        feature_groups=METHODOLOGY.get("feature_groups"),
    )

    return MetaResponse(
        model_version=reg.model_version,
        data_date=reg.data_date,
        coverage=coverage,
        ensemble_weights=reg.ensemble_weights,
        fx=fx,
        flag_definition=flag_definition,
        methodology=methodology,
    )
