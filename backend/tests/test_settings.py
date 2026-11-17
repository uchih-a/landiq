"""Settings tests."""

from app.core.config import Settings


def test_settings_defaults():
    s = Settings()
    assert s.app_env == "development"
    assert s.port == 8000
    assert s.log_level == "INFO"


def test_cors_origins_parses_comma_list():
    s = Settings(allowed_origins="http://a.com, http://b.com ,http://c.com")
    assert s.cors_origins == ["http://a.com", "http://b.com", "http://c.com"]


def test_cors_origins_empty():
    s = Settings(allowed_origins="")
    assert s.cors_origins == []


def test_cors_regex_valid():
    s = Settings(allowed_origins_regex=r"https://.*\.vercel\.app")
    assert s.cors_regex is not None


def test_cors_regex_invalid_returns_none():
    s = Settings(allowed_origins_regex=r"[invalid(")
    assert s.cors_regex is None


def test_is_production_flag():
    assert Settings(app_env="production").is_production is True
    assert Settings(app_env="development").is_production is False


def test_log_level_normalised():
    assert Settings(log_level="debug").log_level == "DEBUG"
