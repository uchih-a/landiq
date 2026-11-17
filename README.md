# Kenya Land Valuation

A full-stack land valuation platform for the Kenyan market: ensemble ML
predictions, market analytics, deal finding, and model explainability.

## Repository layout

```
kenya-land-valuation/
├── backend/           FastAPI backend (Python, uv, Railway)
│   ├── app/           API routers, services, schemas, core
│   ├── tests/         pytest suite (174 tests)
│   ├── README.md      Backend setup + architecture
│   └── ...
├── frontend/          Vite + React + TS frontend (Vercel)
│   ├── src/           App shell, design system, 8 screens, API client
│   ├── README.md      Frontend setup + structure
│   └── ...
├── src/landval/       Shared Python library (features, modelling)
├── docs/              Architecture, ADRs, API docs, known-gaps.md
├── artifacts/         Model + spatial data (git-ignored, mounted at runtime)
├── scripts/           Extraction + validation scripts
├── pyproject.toml     Backend project metadata + pinned deps
├── uv.lock            Backend lockfile (committed)
├── Dockerfile         Multi-stage container (uv-based)
├── Makefile           dev, test, lint, format, container, validate-version
├── .github/workflows/ ci.yml (backend) + ci-frontend.yml (frontend)
└── .gitignore         Covers both Python and Node artifacts
```

## Quick start

### Backend

```bash
uv sync --extra dev
cp .env.example .env
make dev          # → http://localhost:8000/docs
make test
make lint
```

### Frontend

```bash
cd frontend/
npm install
npm run dev       # → http://localhost:5173
npm run build
npm run lint
```

The frontend dev server proxies `/api` to `http://localhost:8000` (the
backend's default port), so both can run locally without CORS issues during
development.

## Deployment

- **Backend**: Railway (Docker image via `Dockerfile`)
- **Frontend**: Vercel (Vite build via `frontend/`)
- CORS: backend's `ALLOWED_ORIGINS` must include the frontend's deployed
  origin. For local dev, both `http://localhost:3000` and
  `http://localhost:5173` are pre-configured in `.env.example`.

See `docs/deploy_railway_vercel.md` for detailed deployment instructions.

## Artifacts

Model files and spatial data are **not committed** to git. Place them in
`artifacts/` (see `artifacts/README.md`). The backend enters "degraded"
mode without them — `/health` returns `status: degraded` and data
endpoints return 503 `DATA_UNAVAILABLE`, but the API still starts.

## Known gaps

See `docs/known-gaps.md` for the consolidated list of every reported gap,
approximation, and deliberate tradeoff across all build phases (B0-B12,
F0-F10).
