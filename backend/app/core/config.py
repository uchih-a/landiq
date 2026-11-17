"""Application settings loaded from environment variables via pydantic-settings."""

from __future__ import annotations

import re
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration comes from environment variables.

    A ``.env`` file in the project root is loaded automatically when present
    (useful for local development).  In production (Railway) the variables
    are injected directly.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Application ----
    app_env: str = "development"
    log_level: str = "INFO"
    port: int = 8000

    # ---- Artifacts ----
    artifacts_dir: str = "./artifacts"

    # ---- Model versioning (B8) ----
    # Which version of the Notebook 3 export is "active" — the ArtifactRegistry
    # loads artifacts from ARTIFACTS_DIR/models/ensemble/<active_model_version>/
    # at startup.  The version identifier reuses the notebook's own
    # ``metadata.json:production_run`` stamp (e.g. "Run A") — no new scheme.
    # When empty, falls back to the flat ARTIFACTS_DIR layout (dev / CI mode).
    active_model_version: str = ""

    # ---- CORS ----
    allowed_origins: str = ""
    allowed_origins_regex: str = ""

    # ---- Rate limiting (B7) ----
    # Per-client rate limit for POST /api/v1/predict, in requests per minute.
    # Conservative starting point — B6 measured ~7ms median / ~15ms p95 for
    # the live-SHAP path, so a single worker can handle ~140 req/s in theory,
    # but real users don't submit predictions faster than every few seconds.
    # 20/min = one prediction every 3s; generous for a human, blocks scripted
    # scraping.  Tunable without a code change via this env var.
    predict_rate_limit_per_minute: int = 20
    # Redis URL for shared rate-limit storage across multiple Railway replicas.
    # When empty (default), slowapi uses in-memory storage — fine for a single
    # replica but under-counts across replicas.  Set REDIS_URL to switch.
    redis_url: str = ""

    @property
    def cors_origins(self) -> list[str]:
        """Parse the comma-separated ALLOWED_ORIGINS into a list."""
        if not self.allowed_origins:
            return []
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def cors_regex(self) -> str | None:
        """Return the compiled regex pattern or None."""
        if not self.allowed_origins_regex:
            return None
        try:
            re.compile(self.allowed_origins_regex)
            return self.allowed_origins_regex
        except re.error:
            return None

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, v: str) -> str:
        return v.upper()

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def versioned_artifacts_dir(self) -> str:
        """The artifacts directory, version-qualified when ACTIVE_MODEL_VERSION is set.

        When ``active_model_version`` is empty (dev / CI), returns ``artifacts_dir``
        as-is — the flat layout the tests use.  When set (production), returns
        ``artifacts_dir/models/ensemble/<active_model_version>`` so the registry
        loads from the version-qualified path (B8).
        """
        import os

        if not self.active_model_version:
            return self.artifacts_dir
        return os.path.join(self.artifacts_dir, "models", "ensemble", self.active_model_version)


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton (overridden in tests via ``app.dependency_overrides``)."""
    return Settings()
