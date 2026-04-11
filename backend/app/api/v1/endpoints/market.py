"""Market data endpoints (public)."""

from typing import List, Optional

from fastapi import APIRouter, Query, Depends  # Added Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.market import (
    CountyStatResponse,
    InvestmentCountyResponse,
    MarketSummaryResponse,
    ProximityDataResponse,
    ScoreDataResponse,
    SpatialListingResponse,
    RawProximityResponse,
    RawProximityPoint,
    ProximityPoint,
)
from app.services.market import (
    get_best_investment,
    get_county_stats,
    get_market_summary,
    get_proximity_data,
    get_score_data,
    get_spatial_listings,
    get_raw_proximity_listings,
)

router = APIRouter()

@router.get("/summary", response_model=MarketSummaryResponse)
async def market_summary(
    county: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), # FIXED: Added Depends()
) -> MarketSummaryResponse:
    """Get market summary statistics."""
    result = await get_market_summary(db, county)
    return MarketSummaryResponse(**result)

@router.get("/counties", response_model=List[CountyStatResponse])
async def county_stats(
    county: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), # FIXED
) -> List[CountyStatResponse]:
    """Get county statistics."""
    result = await get_county_stats(db, county)
    return [CountyStatResponse(**item) for item in result]

@router.get("/spatial", response_model=List[SpatialListingResponse])
async def spatial_listings(
    county: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), # FIXED
) -> List[SpatialListingResponse]:
    """Get spatial listing data."""
    result = await get_spatial_listings(db, county)
    return [SpatialListingResponse(**item) for item in result]

@router.get("/proximity", response_model=ProximityDataResponse)
async def proximity_data(
    county: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), # FIXED
) -> ProximityDataResponse:
    """Get proximity analysis data."""
    result = await get_proximity_data(db, county)
    return ProximityDataResponse(**result)

@router.get("/scores", response_model=ScoreDataResponse)
async def score_data(
    county: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), # FIXED
) -> ScoreDataResponse:
    """Get score analysis data."""
    result = await get_score_data(db, county)
    return ScoreDataResponse(**result)

@router.get("/best-investment", response_model=List[InvestmentCountyResponse])
async def best_investment(
    county: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), # FIXED
) -> List[InvestmentCountyResponse]:
    """Get best investment opportunities."""
    result = await get_best_investment(db, county)
    return [InvestmentCountyResponse(**item) for item in result]

@router.get("/proximity/raw", response_model=RawProximityResponse)
async def proximity_data_raw(
    county: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> RawProximityResponse:
    """Get raw, unaggregated proximity data for all individual listings."""
    result = await get_raw_proximity_listings(db, county)
    return RawProximityResponse(**result)

# Add this import at the top of the file:
# from app.schemas.market import RawProximityResponse
# from app.services.market import get_raw_proximity_listings

@router.get("/proximity/raw", response_model=RawProximityResponse)
async def proximity_data_raw(
    county: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> RawProximityResponse:
    """Get raw, unaggregated proximity data for all individual listings."""
    result = await get_raw_proximity_listings(db, county)
    return RawProximityResponse(**result)