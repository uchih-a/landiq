"""Market data schemas."""
from datetime import datetime
from math import isnan, isinf
from typing import List, Optional
from pydantic import BaseModel, field_validator


def _clean_float(v):
    """Return None if value is NaN/Inf, otherwise return as-is."""
    if v is None:
        return None
    try:
        f = float(v)
        return None if (isnan(f) or isinf(f)) else f
    except (TypeError, ValueError):
        return None


class MarketSummaryResponse(BaseModel):
    total_listings: int
    counties_covered: int
    national_median_price_per_acre: int
    national_avg_price_per_acre: int
    most_expensive_county: str
    best_value_county: str
    ols_r2: float
    total_predictions_made: int
    last_updated: Optional[datetime]


class CountyStatResponse(BaseModel):
    county: str
    avg_price_per_acre: Optional[int]
    median_price_per_acre: Optional[int]
    listing_count: int
    min_price: Optional[int]
    max_price: Optional[int]
    avg_size_acres: Optional[float]
    median_amenities_score: Optional[float]
    median_accessibility_score: Optional[float]
    latitude_centroid: Optional[float]
    longitude_centroid: Optional[float]

    @field_validator(
        "avg_size_acres",
        "median_amenities_score",
        "median_accessibility_score",
        "latitude_centroid",
        "longitude_centroid",
        mode="before",
    )
    @classmethod
    def sanitize_optional_float(cls, v):
        return _clean_float(v)

    model_config = {"from_attributes": True}


class SpatialListingResponse(BaseModel):
    latitude: float
    longitude: float
    price_per_acre: int
    size_acres: float
    county: str

    @field_validator("latitude", "longitude", "size_acres", mode="before")
    @classmethod
    def sanitize_float(cls, v):
        result = _clean_float(v)
        if result is None:
            raise ValueError(f"Non-finite float value: {v}")
        return result


class ProximityPoint(BaseModel):
    county: str
    dist_km: float
    log_price: float
    price_ksh: int
    listing_count: Optional[int] = 0

    @field_validator("dist_km", "log_price", mode="before")
    @classmethod
    def sanitize_float(cls, v):
        return _clean_float(v) or 0.0


class ProximityDataResponse(BaseModel):
    nairobi: List[ProximityPoint]
    reference_city: List[ProximityPoint]


class ScoreBin(BaseModel):
    bin: str
    median_price: int
    q25_price: int
    q75_price: int
    listing_count: int
    reliable: bool


class ScoreDataResponse(BaseModel):
    amenities: List[ScoreBin]
    accessibility: List[ScoreBin]


class InvestmentCountyResponse(BaseModel):
    county: str
    rank: int
    investment_score: float
    median_price_per_acre: int
    listing_count: int
    median_amenities_score: float
    median_accessibility_score: float
    affordability_score: float
    amenity_score: float
    access_score: float
    infrastructure_score: float
    proximity_score: float

    @field_validator(
        "investment_score",
        "median_amenities_score",
        "median_accessibility_score",
        "affordability_score",
        "amenity_score",
        "access_score",
        "infrastructure_score",
        "proximity_score",
        mode="before",
    )
    @classmethod
    def sanitize_float(cls, v):
        return _clean_float(v) or 0.0

    model_config = {"from_attributes": True}


class RawProximityPoint(BaseModel):
    county: str
    dist_km: float
    log_price: float
    price_ksh: int

    @field_validator("dist_km", "log_price", mode="before")
    @classmethod
    def sanitize_float(cls, v):
        return _clean_float(v) or 0.0


class RawProximityResponse(BaseModel):
    nairobi: List[RawProximityPoint]
    reference_city: List[RawProximityPoint]
