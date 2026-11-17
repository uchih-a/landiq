.PHONY: dev test lint format container-build container-run validate-version openapi-snapshot

# PYTHONPATH for the app — needed because the app uses absolute imports
# (`from app.xxx import yyy`) that resolve from backend/ as the package root,
# and the shared library lives under src/ (`from landval.features...`).
# Without this, `make dev`, `make openapi-snapshot`, and `make validate-version`
# all fail with ModuleNotFoundError.  conftest.py has its own sys.path.insert
# for the test suite, but every other entry point needs this env var.
PYTHONPATH_EXPORT := PYTHONPATH=backend:src

# ---- Local dev server ----
dev:
	$(PYTHONPATH_EXPORT) uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# ---- Tests ----
# conftest.py already inserts backend/ and src/ into sys.path, so an
# explicit PYTHONPATH here is technically redundant — but setting it
# doesn't conflict (Python merges PYTHONPATH with sys.path) and makes
# the test target self-contained if conftest.py is ever refactored.
test:
	$(PYTHONPATH_EXPORT) uv run python -m pytest backend/tests/ -v

# ---- Lint (ruff) ----
lint:
	uv run ruff check backend/ src/
	uv run ruff format --check backend/ src/

# ---- Format (ruff) ----
format:
	uv run ruff format backend/ src/
	uv run ruff check --fix backend/ src/

# ---- Container build (Podman/Docker) ----
container-build:
	podman build -t landval-api:latest .

# ---- Container run (Podman/Docker) ----
container-run:
	podman run --rm -it \
		-p 8000:8000 \
		-v $(PWD)/artifacts:/app/artifacts:ro \
		-e APP_ENV=production \
		-e LOG_LEVEL=INFO \
		landval-api:latest

# ---- Model version validation gate (B8) ----
validate-version:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make validate-version VERSION=Run-A"; exit 1; fi
	$(PYTHONPATH_EXPORT) uv run python scripts/parity_check.py \
		--artifacts-dir ./artifacts/models/ensemble/$(VERSION)

# ---- OpenAPI snapshot (B10) ----
openapi-snapshot:
	$(PYTHONPATH_EXPORT) uv run python -c "\
	from app.main import create_app; \
	import json; \
	app = create_app(); \
	spec = app.openapi(); \
	open('docs/openapi.snapshot.json', 'w').write(json.dumps(spec, indent=2)); \
	print('Wrote docs/openapi.snapshot.json')"
