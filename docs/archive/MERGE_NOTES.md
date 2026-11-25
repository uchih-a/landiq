> **Historical (2026-11-18). Numbers superseded by [docs/evidence.md](../evidence.md).** Kept for provenance only; any figure in this file that disagrees with docs/evidence.md is wrong.

# Merge Notes — Unified Backend + Frontend Delivery

This file confirms the delivery-safety checks for the unified
`kenya-land-valuation/` repository containing both the backend (B0-B12)
and frontend (F0-F10), with the PYTHONPATH fix from the last round applied.

## Repository layout

```
kenya-land-valuation/
├── backend/           FastAPI backend (Python, uv, Railway)
├── frontend/          Vite + React + TS frontend (Vercel)
├── src/landval/       Shared Python library (features, modelling)
├── docs/              Architecture, ADRs, API docs, known-gaps.md (50 items)
├── artifacts/         README only (model data git-ignored)
├── scripts/           Extraction + validation + CI scripts
├── .github/workflows/ ci.yml (backend) + ci-frontend.yml (frontend)
├── pyproject.toml     Backend deps (uv, pinned to match Notebook 3)
├── uv.lock            Backend lockfile (committed)
├── Dockerfile         Multi-stage uv-based, PYTHONPATH=/app/backend:/app/src
├── Makefile           PYTHONPATH=backend:src on all app-running targets
├── README.md          Root README linking to both subprojects
├── .gitignore         Covers both Python and Node artifacts
├── .env.example       Backend env vars (PORT=8000, CORS includes :5173)
├── LICENSE            MIT
└── MERGE_NOTES.md     This file
```

## Collisions resolved

1. **README.md** — root README written to explain the two-folder layout
   with quick-start for both subprojects. `frontend/README.md` kept as-is.
   No `backend/README.md` (root covers backend setup).

2. **.gitignore** — single root `.gitignore` covering Python (`__pycache__/`,
   `.venv/`, `.mypy_cache/`, `*.egg-info/`) and Node (`node_modules/`,
   `frontend/dist/`, `frontend/.vite/`). Also covers `frontend/.env`
   while allowing `frontend/.env.example`.

3. **CI workflows** — both in root `.github/workflows/`: `ci.yml` (backend,
   uv-based) and `ci-frontend.yml` (frontend, npm-based with `paths:`
   filter). No `frontend/.github/` directory.

4. **MERGE_NOTES.md** — single root file. No `frontend/MERGE_NOTES.md`.

5. **docs/known-gaps.md** — single file at `docs/known-gaps.md` (repo root).
   50 items covering B0-B12 + F0-F10. NOT duplicated inside `frontend/`.

## Cross-wiring

- Frontend `VITE_API_BASE_URL=http://localhost:8000/api/v1` matches
  backend's default `PORT=8000`. No mismatch.
- Backend CORS `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173`
  includes frontend's default Vite port (5173). No mismatch.
- `vite.config.ts` proxy target `http://localhost:8000` matches backend
  PORT. No mismatch.
- B11 endpoints (`/model/predictions`, `/model/error-by-support`) exist and
  pass tests on the backend. Frontend F7 still shows placeholder text —
  carried forward as item 49 in known-gaps.md (explicitly unresolved).

## Smoke test

- Backend starts in degraded mode (no artifacts). `GET /health` → 200
  `{"status":"degraded"}`. `GET /meta` → 200 with null fields.
  `GET /counties/summary` → 503 `DATA_UNAVAILABLE` (expected — no
  `county_summary.csv` in artifacts).
- Backend tests: 174 passed, 1 skipped.
- Frontend: typecheck 0 errors, lint 0 warnings, build 589 modules OK.
- OpenAPI snapshot check: no diff.
- `/predict` end-to-end: cannot verify (no real model artifacts in workspace).
- Container build/run: cannot verify (no docker/podman in workspace). The
  Dockerfile has `ENV PYTHONPATH=/app/backend:/app/src` and the CI workflow
  has a `container-build-and-health` job that builds + runs + curls /health.

## Top-level files that may already exist in your target repo

| File | Likely exists? | Action |
|---|---|---|
| `README.md` | Likely | Replace — new root README covers both subprojects |
| `.gitignore` | Likely | Replace — merged Python + Node coverage |
| `LICENSE` | Maybe | Keep yours if different; shipped file is MIT |
| `pyproject.toml` | Maybe | Replace if from B12 uv migration |
| `uv.lock` | Unlikely | Safe to add |
| `Dockerfile` | Likely | Replace — has PYTHONPATH fix |
| `Makefile` | Likely | Replace — has PYTHONPATH=backend:src |
| `.github/workflows/ci.yml` | Likely | Replace — has container-health job |
| `.github/workflows/ci-frontend.yml` | Unlikely | Safe to add |
| `.pre-commit-config.yaml` | Maybe | Replace if hook versions differ |
| `.env.example` | Likely | Replace — has B7/B8 vars |
| `.dockerignore` | Maybe | Replace |
| `MERGE_NOTES.md` | Maybe | Replace — this unified version |
| `docs/known-gaps.md` | Maybe | Replace — has 50 items including frontend |
