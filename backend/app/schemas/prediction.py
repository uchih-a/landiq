"""Prediction schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict


class PredictionRequest(BaseModel):
    """Land valuation request."""

    location_text: str = Field(..., min_length=2, max_length=255)
    size_acres: float = Field(..., gt=0, le=50000)
    amenity_score: float = Field(default=50, ge=0, le=100)
    accessibility_score: float = Field(default=50, ge=0, le=100)
    infrastructure_score: float = Field(default=50, ge=0, le=100)


class FeatureBreakdown(BaseModel):
    """Feature contribution breakdown."""

    name: str
    value: str
    unit: str
    influence: str
    direction: str


class PredictionResponse(BaseModel):
    """Land valuation response."""

    id: int
    county: Optional[str]
    geocode_source: Optional[str]
    size_acres: float
    model_used: str
    price_per_acre_ksh: int
    price_total_ksh: int
    price_low_ksh: int
    price_high_ksh: int
    features: List[FeatureBreakdown]
    created_at: datetime
    is_beta: bool = True

    # FIXED: Replaced 'class Config' with Pydantic V2 ConfigDict to silence the warning
    model_config = ConfigDict(
        from_attributes=True, 
        protected_namespaces=()
    )


class PredictionHistoryItem(BaseModel):
    """Single prediction history entry."""

    id: int
    location_text: str
    county: Optional[str]
    size_acres: float
    model_used: str
    price_per_acre_ksh: int
    price_total_ksh: int
    created_at: datetime

    # FIXED: Replaced 'class Config' with Pydantic V2 ConfigDict to silence the warning
    model_config = ConfigDict(
        from_attributes=True, 
        protected_namespaces=()
    )


class PredictionHistoryPage(BaseModel):
    """Paginated prediction history."""

    items: List[PredictionHistoryItem]
    total: int
    page: int
    pages: int