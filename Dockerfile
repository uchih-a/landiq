# ---- Stage 1: builder (uv sync) ----
FROM python:3.12-slim AS builder

WORKDIR /build

# Install uv (per uv's documented Docker pattern)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy only the dependency manifests first (better layer caching)
COPY pyproject.toml uv.lock ./

# Install dependencies using the lockfile (frozen — exact versions)
# --no-dev: don't install dev/test deps (ruff, pytest, etc.) in the prod image
# --system: install into the system site-packages (no venv in the builder)
RUN uv sync --frozen --no-dev --system

# ---- Stage 2: runtime ----
FROM python:3.12-slim

LABEL org.opencontainers.image.title="Kenya Land Valuation API"
LABEL org.opencontainers.image.description="FastAPI backend for Kenya land valuation"

# Non-root user
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

WORKDIR /app

# Copy installed packages from builder (uv --system installed into site-packages)
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# Copy application code
COPY backend/ ./backend/
COPY src/ ./src/

# PYTHONPATH — the app uses absolute imports (`from app.xxx`) that resolve
# from backend/ as the package root, and the shared library lives under
# src/ (`from landval.features...`).  Without this the container crashes
# on startup with ModuleNotFoundError: No module named 'app'.
ENV PYTHONPATH=/app/backend:/app/src

# Create the artifacts mount point (data is mounted at runtime, not baked in)
RUN mkdir -p /app/artifacts && chown app:app /app/artifacts

USER app

# Read PORT from env (Railway injects this; default 8000)
ENV PORT=8000
ENV APP_ENV=production
ENV LOG_LEVEL=INFO
ENV ARTIFACTS_DIR=/app/artifacts

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:'+'${PORT}'+'/api/v1/health')" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
