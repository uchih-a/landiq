"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.services.inference import ModelRegistry

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    print("[startup] Loading MLP model artifacts...")
    try:
        ModelRegistry.load()
        print("[startup] Model loaded successfully")
    except RuntimeError as e:
        print(f"[startup] Warning: {e}")
        print("[startup] API will start but predictions will not work")

    yield

    # Shutdown - no cleanup needed
    print("[shutdown] Cleaning up...")


app = FastAPI(
    title="LandIQ Kenya API",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

# CORS middleware
from fastapi import Request
from fastapi.responses import JSONResponse

@app.middleware("http")
async def cors_on_errors(request: Request, call_next):
    response = await call_next(request)
    origin = request.headers.get("origin", "")
    if origin in settings.ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

# Include API router
app.include_router(api_router, prefix="/api/v1")
