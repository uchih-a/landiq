# Configuration

Owner: [NAME]
Last verified: 2026-11-24

Two-line summary: every environment variable the backend reads, its
default, and what it controls — derived from `.env.example` and
`backend/app/core/config.py`. The frontend has one variable
(`VITE_API_BASE_URL`).

For: operators deploying the service and developers wondering why a value
behaves the way it does.

Copy `.env.example` to `.env` and edit. The backend reads `.env` at
startup via pydantic-settings; **restart after any change** (all
registries and the FX rate load once).

## Application

| Variable | Default | Meaning |
|---|---|---|
| `APP_ENV` | `development` | environment tag; `test` is used by CI/conftest |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING`; dev logs are pretty-printed, production logs are JSON (structlog) |
| `PORT` | `8000` | server port (the frontend dev proxy targets this) |

## Artifacts

| Variable | Default | Meaning |
|---|---|---|
| `ARTIFACTS_DIR` | `./artifacts` | directory holding the model files, app exports, and spatial data (see [artifacts.md](artifacts.md)); read-only volume in production |
| `ACTIVE_MODEL_VERSION` | `""` (flat layout) | which versioned run to load from `ARTIFACTS_DIR/models/ensemble/<NAME>/`; empty = flat dev/CI layout (ADR [0002](decisions/0002-model-versioning.md)) |
| `LISTINGS_EXPORT_MAX_ROWS` | unset (no cap) | server-side cap on `/listings/scored/export.csv` rows |

## CORS

| Variable | Default (`.env.example`) | Meaning |
|---|---|---|
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5173` | comma-separated allowed origins. Note: browsing the dev frontend via `http://127.0.0.1:5173` needs that origin added — only the `localhost` variants are listed by default |
| `ALLOWED_ORIGINS_REGEX` | `https://kenya-land-val-.*\.vercel\.app` | optional regex for Vercel preview URLs; empty disables |

## Rate limiting

| Variable | Default | Meaning |
|---|---|---|
| `PREDICT_RATE_LIMIT_PER_MINUTE` | `20` | per-client limit on `POST /api/v1/predict` (one prediction per 3 s — generous for a human, blocks scraping) |
| `REDIS_URL` | `""` (in-memory) | shared rate-limit storage across Railway replicas; set before scaling beyond one replica |

## FX (KSh ⇄ USD display)

| Variable | Default | Meaning |
|---|---|---|
| `FX_KSH_PER_USD` | unset | the KSh-per-USD rate behind the frontend's USD toggle. **There is no default rate in code**: while unset, `/meta.fx` is `null` and the UI shows an honest "not available" note. Set it to enable USD display |
| `FX_AS_OF` | unset (null) | free-form date for the rate ("YYYY-MM-DD" recommended); surfaced via `/meta` as "as of D" |
| `FX_SOURCE` | unset (null) | who maintains the rate (e.g. "manually maintained via FX_KSH_PER_USD"); surfaced via `/meta` |

The rate is manually maintained; a live FX feed is a separate, unbuilt
architecture decision (see [known-gaps.md](known-gaps.md)).

## Frontend

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` (same origin) | API base for `frontend/src/lib/api/client.ts`. The committed `frontend/.env` sets `http://localhost:8000/api/v1` for dev; in production the frontend is served behind the same domain or the variable is set at build time |

## Validation

`make validate-version` checks the version consistency across
`pyproject.toml` / `metadata.json` / the serving manifest; the full env
schema lives in `backend/app/core/config.py` (pydantic-settings — invalid
values fail at startup with a clear message).
