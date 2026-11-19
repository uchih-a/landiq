"""Health and metadata response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str = Field(..., description="``ok`` or ``degraded``")
    artifacts_loaded: bool = Field(
        ..., description="True when all expected artifact files are present"
    )
    version: str = Field(..., description="Application version")


class CoverageThresholds(BaseModel):
    min_county_n: int = Field(..., description="Minimum listings per county")
    min_nearby_n: int = Field(..., description="Minimum nearby listings")
    radius_km: int = Field(..., description="Radius for nearby listings")


class FlagDefinition(BaseModel):
    """The data-quality-flag percentile window (P7b/P8b).

    Served on ``/meta`` and ``/data/price-distribution`` from the canonical
    ``FLAG_LOWER_PCT`` / ``FLAG_UPPER_PCT`` constants so the UI can say
    "flagged = outside the {{lower}}th–{{upper}}th percentile window"
    without ever typing "1st–99th".
    """

    model_config = ConfigDict(protected_namespaces=())

    lower_pct: int = Field(..., description="Lower percentile of the flag window")
    upper_pct: int = Field(..., description="Upper percentile of the flag window")


class MethodologyBlock(BaseModel):
    """Plain-language methodology copy served by ``/meta`` (P8b).

    One backend place (``app.schemas.canonical.METHODOLOGY``) for the
    data-sources note, the verifiable cleaning steps, and the feature
    groups.  The About page renders from this block instead of keeping
    its own pipeline copy; every claim is verifiable in the repo (see
    the canonical module's comment).
    """

    model_config = ConfigDict(protected_namespaces=())

    sources_note: str | None = Field(
        None, description="Where the listings come from (one sentence)."
    )
    cleaning_steps: list[str] | None = Field(
        None, description="Verifiable cleaning steps, in pipeline order."
    )
    feature_groups: list[str] | None = Field(
        None, description="The production feature groups in plain language."
    )


class FxBlock(BaseModel):
    """KSh↔USD conversion block served by /meta (P8b).

    ``ksh_per_usd`` is the configured rate (1 USD = N KSh).  There is NO
    default rate in code: when ``FX_KSH_PER_USD`` is unset the whole block
    is ``null`` and the frontend disables its USD toggle (an honest
    "not available" state) rather than guessing a rate.

    ``as_of`` — free-form date the operator set the rate ("YYYY-MM-DD"
    recommended).  ``source`` — who maintains the rate (e.g. "manually
    maintained via FX_KSH_PER_USD"; a live FX feed would set its provider
    name here).  A live feed is NOT part of this task; the block is
    operator-configured by design.
    """

    model_config = ConfigDict(protected_namespaces=())

    ksh_per_usd: float = Field(..., description="1 USD = N KSh (config, no default)")
    as_of: str | None = Field(None, description="Date the operator set the rate (free-form).")
    source: str | None = Field(
        None,
        description="Who maintains the rate — distinguishes a manually-maintained rate from a live feed.",
    )


class MetaResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_version: str | None = Field(None, description="Production run name from metadata.json")
    data_date: str | None = Field(None, description="Creation timestamp from metadata.json")
    coverage: CoverageThresholds | None = Field(
        None, description="Coverage rules from coverage_rules.json"
    )
    ensemble_weights: dict | None = Field(
        None, description="Model weights from ensemble_weights.json"
    )
    # P8b: FX from settings (env), NO default rate in code — null when the
    # operator hasn't configured one, so the frontend shows an honest
    # "not available" USD state instead of a plausible fallback.
    fx: FxBlock | None = Field(
        None,
        description=(
            "KSh↔USD conversion rate + its 'as of' date + source.  Null when "
            "the operator hasn't configured FX_KSH_PER_USD.  NOT a live feed."
        ),
    )
    # P7b/P8b: the data-quality-flag window from the canonical constants,
    # so the UI never re-types "1st–99th".
    flag_definition: FlagDefinition | None = Field(
        None,
        description=(
            "The flagged-listing rule: prices outside the lower–upper "
            "percentile window carry data_quality_flag = true.  Always "
            "served (a code constant, not artifact-derived); nullable for "
            "schema-level backward compatibility."
        ),
    )
    # P8b: plain-language methodology (sources note, cleaning steps,
    # feature groups) — the About page renders from this block.
    methodology: MethodologyBlock | None = Field(
        None,
        description=(
            "One-sentence data-sources note + the verifiable cleaning steps "
            "+ the production feature groups.  Served from the canonical "
            "methodology copy; rendered by the About page."
        ),
    )
