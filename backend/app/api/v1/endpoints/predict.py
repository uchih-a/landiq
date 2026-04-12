"""Prediction endpoints."""

import re # Moved to top
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func # Added func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.prediction import Prediction
from app.models.user import User
from app.schemas.prediction import (
    PredictionHistoryPage,
    PredictionRequest,
    PredictionResponse,
)
from app.services.auth import get_current_user
from app.services.inference import ModelRegistry, run_prediction

router = APIRouter()

# FIXED: Moved Regex compilation outside the function so it only compiles once at startup
PLUS_CODE_REGEX = re.compile(
    r"^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$"
)

@router.post("", response_model=PredictionResponse, status_code=status.HTTP_201_CREATED)
async def create_prediction(
    request: PredictionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PredictionResponse:
    """Create a new land valuation prediction."""
    if not ModelRegistry.is_loaded():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model not available",
        )

    try:
        result = await run_prediction(
            location_text=request.location_text,
            size_acres=request.size_acres,
            amenity_score=request.amenity_score,
            accessibility_score=request.accessibility_score,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not resolve location. Try a county name or Google Plus Code.",
        )

    if PLUS_CODE_REGEX.match(request.location_text.strip().upper()):
        geocode_source = "plus_code"
    elif (
        result["county"]
        and request.location_text.lower().strip() == result["county"].lower()
    ):
        geocode_source = "county"
    else:
        geocode_source = "nominatim"

    prediction = Prediction(
    user_id=current_user.id,
    location_text=request.location_text,
    county=result["county"],
    latitude=result["lat"],
    longitude=result["lng"],
    geocode_source=geocode_source,
    size_acres=request.size_acres,
    log_land_size=result["features"]["log_land_size"],
    amenity_score=request.amenity_score,
    accessibility_score=request.accessibility_score,
    dist_to_reference_km=result["features"]["dist_to_reference_km"],
    dist_to_city_km=result["features"]["dist_to_city_km"],
    geo_confidence=result["features"]["geocode_confidence"],
    model_used="mlp",
    log_pred=result["log_pred"],
    price_per_acre_ksh=result["price_per_acre_ksh"],
    price_total_ksh=result["price_total_ksh"],
    price_low_ksh=result["price_low_ksh"],
    price_high_ksh=result["price_high_ksh"],
    )
    db.add(prediction)
    await db.flush() 
    await db.commit() # Added commit to ensure it saves properly
    await db.refresh(prediction)

    return PredictionResponse(
        id=prediction.id,
        county=prediction.county,
        geocode_source=prediction.geocode_source,
        size_acres=prediction.size_acres,
        model_used=prediction.model_used,
        price_per_acre_ksh=prediction.price_per_acre_ksh,
        price_total_ksh=prediction.price_total_ksh,
        price_low_ksh=prediction.price_low_ksh,
        price_high_ksh=prediction.price_high_ksh,
        features=result["feature_breakdown"],
        created_at=prediction.created_at,
        is_beta=True,
    )

@router.get("/history", response_model=PredictionHistoryPage)
async def get_prediction_history(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PredictionHistoryPage:
    """Get paginated prediction history for current user."""
    
    # FIXED: Use SQL COUNT instead of loading all objects into memory
    count_query = await db.execute(
        select(func.count()).select_from(Prediction).where(Prediction.user_id == current_user.id)
    )
    total = count_query.scalar() or 0

    offset = (page - 1) * limit
    result = await db.execute(
        select(Prediction)
        .where(Prediction.user_id == current_user.id)
        .order_by(Prediction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    predictions = result.scalars().all()

    pages = (total + limit - 1) // limit if total > 0 else 0

    return PredictionHistoryPage(
        items=[
            {
                "id": p.id,
                "location_text": p.location_text,
                "county": p.county,
                "size_acres": p.size_acres,
                "model_used": p.model_used,
                "price_per_acre_ksh": p.price_per_acre_ksh,
                "price_total_ksh": p.price_total_ksh,
                "created_at": p.created_at,
            }
            for p in predictions
        ],
        total=total,
        page=page,
        pages=pages,
    )
