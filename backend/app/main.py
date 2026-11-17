"""FastAPI application factory and lifespan.

Run locally:

    uvicorn backend.app.main:app --reload --port 8000

Or via the Makefile:

    make dev
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi.errors import RateLimitExceeded

from app.api.v1.routers import counties as counties_router
from app.api.v1.routers import data_explorer as data_explorer_router
from app.api.v1.routers import health as health_router
from app.api.v1.routers import listings as listings_router
from app.api.v1.routers import meta as meta_router
from app.api.v1.routers import metrics as metrics_router
from app.api.v1.routers import model as model_router
from app.api.v1.routers import places as places_router
from app.api.v1.routers import predict as predict_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestIDMiddleware, TimingMiddleware
from app.services.app_exports import AppExportsRegistry
from app.services.artifact_registry import ArtifactRegistry
from app.services.county_boundaries import CountyBoundariesIndex
from app.services.named_poi_index import NamedPOIIndex
from app.services.places_index import PlacesIndex

logger = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: configure logging + load artifacts + load the model
    registry + load the Phase 9 app-export files.

    The ``ArtifactRegistry`` (B0) checks for the flat top-level files in
    ``ARTIFACTS_DIR`` and enters degraded mode if any are missing.  The
    ``ModelRegistry`` (B2) reads ``serving_manifest.json`` and loads every
    model file the manifest lists; ``ModelLoadError`` is caught here so
    ``/api/v1/predict`` returns 503 ``MODEL_NOT_LOADED`` rather than 500.
    The ``AppExportsRegistry`` (this phase) loads the Phase 9 app-export
    files (``county_summary.csv``, ``metrics_table.csv`` / ``metrics.json``,
    ``feature_evaluation.csv``, ``shap_global.csv`` /
    ``feature_importance.csv`` / ``feature_labels.json``,
    ``listings_scored.parquet``, ``manifest.json``) — each independently,
    so a missing file sets its attribute to ``None`` and the corresponding
    read-only endpoint returns 503 ``DATA_UNAVAILABLE``.
    """
    settings = get_settings()

    configure_logging(
        log_level=settings.log_level,
        json_output=settings.is_production,
    )
    logger.info("startup", env=settings.app_env, port=settings.port)

    registry = ArtifactRegistry(artifacts_dir=settings.versioned_artifacts_dir)
    registry.load()
    app.state.registry = registry
    app.state.settings = settings

    # ---- App-exports registry (read-only data endpoints) ----
    # Always loads — even when ArtifactRegistry is in degraded mode, the
    # app-export files under app_exports/ may still be present (e.g. the
    # operator only copied the small CSVs and not the large model files).
    app_exports = AppExportsRegistry(artifacts_dir=settings.versioned_artifacts_dir).load()
    app.state.app_exports = app_exports

    # ---- Places gazetteer + named-POI index (search box + predict diagnostics) ----
    # Loaded independently of the model registry — the places search and
    # named-POI lookup work even when the model artefacts are absent.  When
    # the GPKG files aren't present (the extraction hasn't been run), both
    # indexes construct with loaded=False and the endpoints return 503
    # DATA_UNAVAILABLE.
    import os as _os

    places_gpkg = _os.path.join(settings.versioned_artifacts_dir, "kenya_places.gpkg")
    named_poi_gpkg = _os.path.join(settings.versioned_artifacts_dir, "kenya_pois_named.gpkg")
    app.state.places_index = PlacesIndex(gpkg_path=places_gpkg).load()
    app.state.named_poi_index = NamedPOIIndex(gpkg_path=named_poi_gpkg).load()
    if app.state.places_index.loaded:
        logger.info(
            "places_index_ready",
            n_places=app.state.places_index.n_places,
            load_time_s=app.state.places_index.load_time_s,
            memory_mb=app.state.places_index.memory_mb,
        )
    if app.state.named_poi_index.loaded:
        logger.info(
            "named_poi_index_ready",
            n_pois=app.state.named_poi_index.n_pois,
            n_per_category=app.state.named_poi_index.n_per_category,
            load_time_s=app.state.named_poi_index.load_time_s,
            memory_mb=app.state.named_poi_index.memory_mb,
        )

    # ---- County boundaries (Market Insights choropleth) ----
    # Simplified GeoJSON from GADM Level 1 (Cell 4.9's source), simplified
    # via Douglas-Peucker for page-load rendering.  Loaded independently of
    # the model registry — the choropleth works even when the model artefacts
    # are absent.
    county_geojson_path = _os.path.join(
        settings.versioned_artifacts_dir, "kenya_counties_simplified.geojson"
    )
    app.state.county_boundaries_index = CountyBoundariesIndex(
        geojson_path=county_geojson_path
    ).load()
    if app.state.county_boundaries_index.loaded:
        logger.info(
            "county_boundaries_ready",
            n_counties=app.state.county_boundaries_index.n_counties,
            file_size_mb=app.state.county_boundaries_index.file_size_mb,
            load_time_s=app.state.county_boundaries_index.load_time_s,
        )

    # ---- Model registry + prediction service + explanation + comparables ----
    # Only attempt to load the heavy model files when the lightweight
    # ArtifactRegistry says everything is in place; otherwise the same
    # missing files would be reported twice.
    app.state.model_registry = None
    app.state.prediction_service = None
    app.state.explanation_service = None
    app.state.comparables_service = None
    app.state.amenity_proximity_service = None
    if registry.loaded:
        try:
            from landval.features.pipeline import FeaturePipeline
            from landval.modelling import (
                ComparablesService,
                LiveExplanationService,
                ModelLoadError,
                ModelRegistry,
                PredictionService,
            )

            model_reg = ModelRegistry(artifacts_dir=settings.versioned_artifacts_dir).load()
            app.state.model_registry = model_reg
            # The feature pipeline needs the same artifacts_dir; it loads
            # scoring_params.json / reference_data.json / feature_manifest.json
            # plus the spatial indexes (lazy).  If those are absent it raises
            # FileNotFoundError — caught here so the app still starts and the
            # operator sees the message in /health's missing_files list.
            feature_pipeline = None
            try:
                feature_pipeline = FeaturePipeline(artifacts_dir=settings.versioned_artifacts_dir)
                app.state.prediction_service = PredictionService(
                    registry=model_reg,
                    feature_pipeline=feature_pipeline,
                    artifacts_dir=settings.versioned_artifacts_dir,
                )
            except FileNotFoundError as e:
                logger.warning(
                    "feature_pipeline_unavailable",
                    error=str(e),
                    msg="PredictionService not built — feature pipeline config missing",
                )

            # ---- Live explanation service (Cell 9.4 SHAP + Cell 9.10 rule) ----
            # Built only when at least one tree member is loaded — TabNet
            # alone cannot be explained by shap.TreeExplainer.  The feature
            # labels come from B3's AppExportsRegistry (feature_labels.json).
            if model_reg.tree_members_loaded:
                feature_labels_json = app_exports.feature_labels_json if app_exports else None
                try:
                    app.state.explanation_service = LiveExplanationService(
                        registry=model_reg,
                        feature_labels_json=feature_labels_json,
                        top_n=10,
                    )
                    logger.info(
                        "explanation_service_ready",
                        explained_members=model_reg.tree_members_loaded,
                        unexplained_members=[
                            m for m in model_reg.kept_members if m not in ("xgb", "catboost")
                        ],
                        recomputed_shap_coverage=model_reg.recomputed_shap_coverage(),
                    )
                except Exception as e:
                    # shap is an optional dependency in CI; live explanation
                    # is a soft-failure surface (the predict endpoint returns
                    # null for ``explanation`` when this is None).
                    logger.warning(
                        "explanation_service_unavailable",
                        error=str(e),
                        error_type=type(e).__name__,
                    )

            # ---- Comparables service (Cell 9.6 listings_scored.parquet) ----
            # listings_scored_df comes from B3's AppExportsRegistry; coverage_rules
            # from the model registry.  When the parquet is missing the service
            # still constructs (it just returns [] from find_comparables).
            try:
                app.state.comparables_service = ComparablesService(
                    listings_scored_df=(app_exports.listings_scored_df if app_exports else None),
                    coverage_rules=model_reg.coverage_rules,
                )
                logger.info(
                    "comparables_service_ready",
                    n_listings=(
                        int(len(app_exports.listings_scored_df))
                        if app_exports and app_exports.listings_scored_df is not None
                        else 0
                    ),
                )
            except Exception as e:
                logger.warning(
                    "comparables_service_unavailable",
                    error=str(e),
                    error_type=type(e).__name__,
                )

            # ---- Amenity-proximity service (Deal Finder near_amenity filter) ----
            # Backs the GET /api/v1/listings/scored?near_amenity=school&radius_km=1
            # filter.  Recomputes per-listing distances from stored lat/lon via
            # B1's existing BallTrees (the raw dist_to_*_km columns did not
            # survive into listings_scored.parquet).  Built only when the
            # feature pipeline is available; otherwise the filter returns 503.
            if feature_pipeline is not None:
                try:
                    from app.services.amenity_proximity import AmenityProximityService

                    app.state.amenity_proximity_service = AmenityProximityService(
                        feature_pipeline=feature_pipeline,
                        listings_scored_df=(
                            app_exports.listings_scored_df if app_exports else None
                        ),
                    )
                    logger.info(
                        "amenity_proximity_service_ready",
                        configured_amenities=feature_pipeline.configured_amenities(),
                        configured_road_classes=feature_pipeline.configured_road_classes(),
                    )
                except Exception as e:
                    logger.warning(
                        "amenity_proximity_service_unavailable",
                        error=str(e),
                        error_type=type(e).__name__,
                    )

            logger.info(
                "model_registry_loaded",
                kept_members=model_reg.kept_members,
                weights=model_reg.kept_weights,
                load_time_s=model_reg.load_time_s,
                memory_mb=model_reg.memory_mb,
                explanation_service=bool(app.state.explanation_service),
                comparables_service=bool(app.state.comparables_service),
                amenity_proximity_service=bool(app.state.amenity_proximity_service),
            )
        except ModelLoadError as e:
            logger.warning(
                "model_registry_degraded",
                error=str(e),
                missing_files=e.args[0] if e.args else "",
            )

    yield

    logger.info("shutdown")


def create_app() -> FastAPI:
    """Application factory (used by uvicorn and tests)."""
    settings = get_settings()

    app = FastAPI(
        title="Kenya Land Valuation API",
        description=(
            "Backend API for the Kenya land valuation app.  Provides "
            "price-per-acre predictions, market insights, and model "
            "explainability for Kenyan land parcels."
        ),
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ---- Middleware (order matters: outermost first) ----
    app.add_middleware(TimingMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["x-request-id"],
    )

    # ---- Rate limiting (B7) ----
    # Per-client rate limit scoped to POST /api/v1/predict only.
    # slowapi with a custom X-Forwarded-For key function + custom 429 handler.
    from app.core.rate_limit import make_limiter, rate_limit_exceeded_handler

    limiter = make_limiter(redis_url=settings.redis_url)
    app.state.limiter = limiter
    # Custom handler returns the B0 error body shape + Retry-After header
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    # The SlowAPIMiddleware must be added so the limiter decorator works.
    from slowapi.middleware import SlowAPIMiddleware

    app.add_middleware(SlowAPIMiddleware)

    # ---- Exception handlers ----
    register_exception_handlers(app)

    # ---- Routers ----
    api_v1_prefix = "/api/v1"
    app.include_router(health_router.router, prefix=api_v1_prefix)
    app.include_router(meta_router.router, prefix=api_v1_prefix)
    app.include_router(predict_router.router, prefix=api_v1_prefix)
    app.include_router(counties_router.router, prefix=api_v1_prefix)
    app.include_router(model_router.router, prefix=api_v1_prefix)
    app.include_router(places_router.router, prefix=api_v1_prefix)
    app.include_router(listings_router.router, prefix=api_v1_prefix)
    app.include_router(data_explorer_router.router, prefix=api_v1_prefix)
    # /metrics is NOT under /api/v1 — standard Prometheus scrape path
    app.include_router(metrics_router.router)

    # ---- Root redirect to docs ----
    @app.get("/", include_in_schema=False)
    async def root_redirect():
        from fastapi.responses import RedirectResponse

        return RedirectResponse(url="/docs")

    return app


app = create_app()
