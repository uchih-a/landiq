"""Application configuration using pydantic-settings."""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7
    ALLOWED_ORIGINS: List[str] = ["https://landiq-one.vercel.app"]
    MODEL_DIR: str = "./ml_models"
    NOMINATIM_USER_AGENT: str = "landiq-kenya/1.0"
    APP_ENV: str = "development"
    DEBUG: bool = False
    APP_VERSION: str = "1.0.0"

    def model_post_init(self, __context: object) -> None:
        """Validate settings after initialization."""
        if not self.JWT_SECRET_KEY or len(self.JWT_SECRET_KEY) < 32:
            raise ValueError(
                "JWT_SECRET_KEY must be at least 32 characters long. "
                "Please set a secure secret key in your .env file."
            )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
