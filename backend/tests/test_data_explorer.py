"""Tests for GET /api/v1/data/price-distribution (Data Explorer fidelity round).

Happy path against the same tiny ``listings_scored`` fixture the
``/listings/scored`` tests use (3 usable rows, 1 flagged), plus the
degraded-mode 503 when the parquet is missing, plus the empty-prices
degenerate case.  The exact helpers are re-imported from
``test_app_exports`` so the fixture shapes can never drift apart.
"""

from __future__ import annotations

import numpy as np
import pytest

from tests.test_app_exports import _all_tiny_exports, _tiny_listings_scored, _write_app_exports


@pytest.fixture
def app_with_exports(app, tmp_path):
    _write_app_exports(tmp_path, _all_tiny_exports())
    from app.services.app_exports import AppExportsRegistry

    new_reg = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
    app.state.app_exports = new_reg
    yield app


class TestPriceDistribution:
    def test_happy_path(self, app_with_exports, client):
        resp = client.get("/api/v1/data/price-distribution")
        assert resp.status_code == 200, resp.text
        body = resp.json()

        # 3 usable rows in the fixture (all with finite positive prices)
        assert body["n_usable"] == 3
        assert body["n_bins"] == 24
        assert len(body["bins"]) == 24
        # Every bin count is a non-negative int and their sum covers all rows
        counts = [b["count"] for b in body["bins"]]
        assert all(isinstance(c, int) and c >= 0 for c in counts)
        assert sum(counts) == 3
        # Bin edges are strictly increasing and log-spaced
        lowers = [b["lower_ksh"] for b in body["bins"]]
        uppers = [b["upper_ksh"] for b in body["bins"]]
        assert all(lo < hi for lo, hi in zip(lowers, uppers, strict=False))
        assert all(uppers[i] == pytest.approx(lowers[i + 1]) for i in range(len(lowers) - 1))

        # Percentile ordering on a 3-row set: p1 <= p10 <= p50 <= p90 <= p99
        p = body["percentiles"]
        assert p["p1"] <= p["p10"] <= p["p50"] <= p["p90"] <= p["p99"]
        # Median of the 3 fixture prices is the middle value
        df = _tiny_listings_scored()
        expected_median = float(df["listed_price_per_acre_ksh"].sort_values().iloc[1])
        assert p["p50"] == pytest.approx(expected_median)

    def test_flagged_count_matches_fixture(self, app_with_exports, client):
        resp = client.get("/api/v1/data/price-distribution")
        body = resp.json()
        df = _tiny_listings_scored()
        expected = int(df["data_quality_flag"].astype(bool).sum())
        assert body["n_flagged"] == expected

    def test_flag_definition_served_from_canonical_constants(self, app_with_exports, client):
        """P7b: the flag rule comes from the canonical constants so the UI
        can explain the flag without typing '1st-99th'."""
        from app.schemas.canonical import FLAG_LOWER_PCT, FLAG_UPPER_PCT

        resp = client.get("/api/v1/data/price-distribution")
        body = resp.json()
        fd = body["flag_definition"]
        assert fd is not None
        assert fd["lower_pct"] == FLAG_LOWER_PCT
        assert fd["upper_pct"] == FLAG_UPPER_PCT

    def test_flag_definition_served_in_degenerate_case(self, app, tmp_path):
        """The empty-prices degenerate response still carries the flag rule."""
        df = _tiny_listings_scored().copy()
        df["listed_price_per_acre_ksh"] = float("nan")
        _write_app_exports(tmp_path, {"listings_scored.parquet": df})
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            body = client.get("/api/v1/data/price-distribution").json()
            assert body["flag_definition"] is not None
            assert body["flag_definition"]["lower_pct"] == 1
            assert body["flag_definition"]["upper_pct"] == 99

    def test_degraded_mode_returns_503(self, app, client):
        # ``app`` fixture has an empty ARTIFACTS_DIR — the parquet is missing
        resp = client.get("/api/v1/data/price-distribution")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "DATA_UNAVAILABLE"

    def test_empty_prices_degenerate(self, app, tmp_path):
        # A parquet whose price column is all NaN -> 0 bins, not a 500.
        df = _tiny_listings_scored().copy()
        df["listed_price_per_acre_ksh"] = float("nan")
        _write_app_exports(tmp_path, {"listings_scored.parquet": df})
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            resp = client.get("/api/v1/data/price-distribution")
            assert resp.status_code == 200
            body = resp.json()
            assert body["n_usable"] == 0
            assert body["n_bins"] == 0
            assert body["bins"] == []

    def test_bins_cover_all_usable_prices(self, app_with_exports, client):
        """No usable price may fall outside the reported bin range."""
        resp = client.get("/api/v1/data/price-distribution")
        body = resp.json()
        df = _tiny_listings_scored()
        prices = df["listed_price_per_acre_ksh"].to_numpy(dtype=float)
        usable = prices[np.isfinite(prices) & (prices > 0)]
        # The 0.5/99.5 percentile clipping means extreme tails can sit
        # outside [lower, upper] — but they must still be counted in the
        # clamped final bin (see router's clamp), so sum(counts) == n_usable.
        assert sum(b["count"] for b in body["bins"]) == len(usable)
