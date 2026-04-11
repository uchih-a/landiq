"""API v1 router."""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, health, market, predict

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(predict.router, prefix="/predict", tags=["predict"])
api_router.include_router(market.router, prefix="/market", tags=["market"])
api_router.include_router(health.router, tags=["health"])
