"""Tests for /meta's FX block (P8b — supersedes the O3-era shape).

P8b requirements:
- NO default rate in code: ``fx`` is null when ``FX_KSH_PER_USD`` is unset
  (the frontend disables its USD toggle instead of guessing a rate).
- ``fx`` present with the configured rate when the env var is set, plus
  ``as_of`` / ``source`` from their env vars (null when unset).
- No NaN/inf in the block.
- The rest of /meta (model_version, data_date, coverage, ensemble_weights)
  is unchanged — backward compatible.
"""

from __future__ import annotations

import math

from fastapi.testclient import TestClient

from app.main import create_app


class TestMetaFx:
    def test_fx_null_when_env_unset(self, app, client):
        """No default rate in code: fx is null until the operator sets it."""
        resp = client.get("/api/v1/meta")
        assert resp.status_code == 200
        body = resp.json()
        assert body["model_version"] is None
        assert body["data_date"] is None
        assert body["fx"] is None, "fx must be null when FX_KSH_PER_USD is unset"

    def test_fx_present_when_env_set(self, monkeypatch, app):
        """FX_KSH_PER_USD set -> the block serves that rate + as_of + source."""
        from app.core.config import get_settings

        monkeypatch.setenv("FX_KSH_PER_USD", "150")
        monkeypatch.setenv("FX_AS_OF", "2025-06-01")
        monkeypatch.setenv("FX_SOURCE", "manually maintained via FX_KSH_PER_USD")
        get_settings.cache_clear()
        application = create_app()
        with TestClient(application) as c:
            body = c.get("/api/v1/meta").json()
            assert body["fx"] is not None
            assert body["fx"]["ksh_per_usd"] == 150.0
            assert body["fx"]["as_of"] == "2025-06-01"
            assert body["fx"]["source"] == "manually maintained via FX_KSH_PER_USD"
            # No NaN / inf anywhere in the block.
            for v in body["fx"].values():
                if isinstance(v, float):
                    assert math.isfinite(v)

    def test_fx_as_of_and_source_null_when_unset(self, monkeypatch, app):
        """Rate set but FX_AS_OF / FX_SOURCE empty -> those fields are null."""
        from app.core.config import get_settings

        monkeypatch.setenv("FX_KSH_PER_USD", "131.5")
        monkeypatch.delenv("FX_AS_OF", raising=False)
        monkeypatch.delenv("FX_SOURCE", raising=False)
        get_settings.cache_clear()
        application = create_app()
        with TestClient(application) as c:
            body = c.get("/api/v1/meta").json()
            assert body["fx"]["ksh_per_usd"] == 131.5
            assert body["fx"]["as_of"] is None
            assert body["fx"]["source"] is None

    def test_meta_other_fields_unchanged(self, app, client):
        """Backward compatibility: the pre-P8b fields keep their contract."""
        body = client.get("/api/v1/meta").json()
        # The exact set of top-level keys — the P8b additions are additive.
        assert set(body.keys()) == {
            "model_version",
            "data_date",
            "coverage",
            "ensemble_weights",
            "fx",
            "flag_definition",
            "methodology",
        }
        assert body["model_version"] is None
        assert body["data_date"] is None
        assert body["coverage"] is None
        assert body["ensemble_weights"] is None
