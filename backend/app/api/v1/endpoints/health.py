"""Health check endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.services.inference import ModelRegistry
from app.db.session import get_db # Import your db session getter

router = APIRouter()

@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:
    """Health check endpoint."""
    settings = get_settings()
    
    # Actually verify the DB connection
    db_connected = False
    try:
        await db.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        pass

    return {
        "status": "ok" if db_connected else "degraded",
        "model_loaded": ModelRegistry.is_loaded(),
        "db_connected": db_connected,
        "version": settings.APP_VERSION,
    }