"""Shared pytest fixtures."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure backend/app is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Ensure src/landval is importable (the package lives under <repo>/src/,
# not under backend/).  Without this both test_features.py and
# test_predict.py fail at collection time with ModuleNotFoundError: landval.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "src"))

from app.core.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
def app(monkeypatch, tmp_path):
    """Create the FastAPI app with test settings via environment variables.

    Using monkeypatch.setenv ensures ``get_settings()`` reads the test
    values when called inside ``create_app()`` (CORS config, lifespan).
    """
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    monkeypatch.setenv("PORT", "8000")
    monkeypatch.setenv("ARTIFACTS_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    monkeypatch.setenv("ALLOWED_ORIGINS_REGEX", "")

    get_settings.cache_clear()
    application = create_app()

    yield application

    get_settings.cache_clear()


@pytest.fixture
def client(app):
    """Test client that triggers the lifespan startup."""
    with TestClient(app) as c:
        yield c
