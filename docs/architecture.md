# Architecture

## Layers

```mermaid
graph TB
    subgraph Client
        FE[Frontend — Vercel]
    end

    subgraph Railway["Backend (Railway)"]
        LB[Load Balancer]
        APP[FastAPI App]

        subgraph Middleware
            CORS[CORS]
            RID[Request-ID]
            GZIP[Gzip]
            RATE[Rate Limiter]
        end

        subgraph Routers["API v1"]
            HEALTH[GET /health]
            META[GET /meta]
            PREDICT[POST /predict — future]
        end

        subgraph Services
            REG[Artifact Registry]
            MODEL[Model Service — future]
        end

        subgraph Core
            CFG[Settings pydantic-settings]
            LOG[Structured JSON Logging]
            ERR[Error Handlers]
        end
    end

    subgraph Volume["Mounted Volume (read-only)"]
        ART[artifacts/]
        MODEL_FILES[xgb_model.json<br/>catboost_model.cbm<br/>tabnet_model.zip]
        META_FILES[metadata.json<br/>coverage_rules.json<br/>ensemble_weights.json]
    end

    FE -->|HTTPS| LB
    LB --> APP
    APP --> CORS --> RID --> GZIP --> RATE --> Routers
    HEALTH --> REG
    META --> REG
    REG --> ART
    ART --> MODEL_FILES
    ART --> META_FILES
    APP -.-> CFG
    APP -.-> LOG
    APP -.-> ERR
```

## Request flow

1. Request hits Railway's load balancer → FastAPI app.
2. Middleware chain (CORS → Request-ID → Gzip → Rate limiter) processes the request.
3. Router dispatches to the appropriate handler.
4. Handler reads from the `ArtifactRegistry` (loaded once at startup via lifespan).
5. Response flows back through middleware (request-id header added, structured access log emitted).

## Degraded mode

When artifact files are missing the `ArtifactRegistry` sets `loaded = False`.
The app still starts (so `/docs`, tests, and CI work), but:
- `/health` returns `status: "degraded"`, `artifacts_loaded: false`
- `/meta` returns `null` for all data fields
- Prediction endpoints (future) return `503 ARTIFACT_NOT_LOADED`

## Logging

All logs are structured JSON (via structlog) in production, containing at minimum:
`timestamp`, `level`, `event`, `request_id`, `logger`. In development, logs are
pretty-printed to the console for readability.
