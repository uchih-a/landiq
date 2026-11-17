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
