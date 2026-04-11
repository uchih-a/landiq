"""Market data schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class MarketSummaryResponse(BaseModel):
    """Market summary statistics."""

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
    """County statistics."""

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

    class Config:
        from_attributes = True


class SpatialListingResponse(BaseModel):
    """Spatial listing data point."""

    latitude: float
    longitude: float
    price_per_acre: int
    size_acres: float
    county: str


class ProximityPoint(BaseModel):
    """Proximity data point."""

    county: str
    dist_km: float
    log_price: float
    price_ksh: int
    listing_count: Optional[int] = 0


class ProximityDataResponse(BaseModel):
    """Proximity analysis data."""

    nairobi: List[ProximityPoint]
    reference_city: List[ProximityPoint]


class ScoreBin(BaseModel):
    """Score bin data."""

    bin: str
    median_price: int
    q25_price: int
    q75_price: int
    listing_count: int
    reliable: bool


class ScoreDataResponse(BaseModel):
    """Score analysis data."""

    amenities: List[ScoreBin]
    accessibility: List[ScoreBin]


class InvestmentCountyResponse(BaseModel):
    """
    Investment opportunity ranking.

    All five dimension scores are on a 0-1 scale:
      - affordability_score  (weight 35%): inverse-normalised price
      - amenity_score        (weight 20%): normalised amenities
      - access_score         (weight 20%): normalised accessibility
      - infrastructure_score (weight 15%): inverse-normalised dist_to_nairobi_km
      - proximity_score      (weight 10%): inverse-normalised reference_city_dist_km

    investment_score is the weighted sum, also 0-1.
    """

    county: str
    rank: int

    # Weighted composite (0-1)
    investment_score: float

    # Raw market data
    median_price_per_acre: int
    listing_count: int

    # Backward-compat fields (kept so existing consumers don't break)
    median_amenities_score: float
    median_accessibility_score: float

    # ── Five dimension scores consumed by the stacked bar chart ──
    affordability_score:  float   # 0-1, weight 35%
    amenity_score:        float   # 0-1, weight 20%
    access_score:         float   # 0-1, weight 20%
    infrastructure_score: float   # 0-1, weight 15%
    proximity_score:      float   # 0-1, weight 10%

    class Config:
        from_attributes = True


class RawProximityPoint(BaseModel):
    county: str
    dist_km: float
    log_price: float
    price_ksh: int


class RawProximityResponse(BaseModel):
    nairobi: List[RawProximityPoint]
    reference_city: List[RawProximityPoint]