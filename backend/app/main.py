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
    print("[startup] Loading MLP model artifacts...")
    try:
        ModelRegistry.load()
        print("[startup] Model loaded successfully")
    except RuntimeError as e:
        print(f"[startup] Warning: {e}")
        print("[startup] API will start but predictions will not work")
    yield
    print("[shutdown] Cleaning up...")

app = FastAPI(
    title="LandIQ Kenya API",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",    # always enabled so you can inspect routes
    redoc_url="/redoc",  # always enabled
)

# ✅ Proper CORS middleware — handles OPTIONS preflight automatically
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],  # critical: allows OPTIONS, GET, POST, etc.
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")
