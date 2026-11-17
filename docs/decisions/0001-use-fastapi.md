# ADR 0001: Use FastAPI for the backend

## Status

Accepted

## Context

The Kenya land valuation app needs a Python backend that:
- Serves a REST API for price predictions, market insights, and model explainability
- Loads XGBoost / CatBoost models (Python-native ML libraries)
- Runs in a container on Railway with health checks
- Provides OpenAPI docs for frontend developers
- Has first-class async support for I/O-bound operations (geocoding, spatial queries)

## Decision

Use **FastAPI** with **uvicorn** as the ASGI server.

## Rationale

- **Python-native**: XGBoost, CatBoost, scikit-learn are Python libraries — keeping the backend in Python avoids a serialization boundary.
- **Automatic OpenAPI**: Pydantic models generate the `/docs` Swagger UI and JSON schema, so frontend developers can work from live docs.
- **Async**: FastAPI's async support handles I/O-bound work (loading model files, future geocoding endpoints) without blocking.
- **Pydantic v2**: Fast validation with type hints that double as documentation.
- **Ecosystem**: Starlette middleware (CORS, gzip), dependency injection, and lifespan hooks are mature and well-documented.

## Consequences

- The backend requires a Python 3.12 runtime (container image is `python:3.12-slim`).
- Model files must be mounted as a volume (not baked into the image — they are too large).
- The frontend is deployed separately on Vercel and communicates via HTTPS + CORS.
