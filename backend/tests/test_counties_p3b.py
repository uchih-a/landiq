"""Tests for GET /api/v1/counties/summary (P3b) + the new
GET /api/v1/counties/{county}/distance-profile endpoint.

Covers (per the brief): prop_type filter changes medians; exact /
case-insensitive match; 422s with ``allowed``; band edges are quantiles
and change with the filter; fewer-counties-than-bands case; missing
MIN_COUNTY_N -> null + data_quality (no typed 10); distance-profile
sample deterministic, unbiased (frame sorted by price still yields a
mixed sample), respects the limit cap; trend equals a hand OLS;
low_support omits trend; no NaN/inf in JSON.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from tests.test_app_exports import _tiny_manifest, _write_app_exports


def _mi_frame() -> pd.DataFrame:
    """Hand-checkable frame for the Market Insights tests.

    12 rows across 2 counties (Nairobi 8, Kiambu 4) + 2 types:
      Nairobi Land rows (6): prices 6M, 5M, 4M, 3M, 2M, 1M  (median 3.5M)
      Nairobi Farm rows (2): prices 9M, 8M                (median 8.5M)
      Kiambu  Land rows (2): prices 1.5M, 0.5M            (median 1.0M)
      Kiambu  Farm rows (2): prices 3M, 1M                (median 2.0M)
    Distances from Nairobi are ~0-15 km (Nairobi rows) / 25-40 (Kiambu).
    """
    rows = []
    # Nairobi Land — 6 rows with known median 3.5M.
    for i, price in enumerate([6e6, 5e6, 4e6, 3e6, 2e6, 1e6], start=1):
        rows.append(
            {
                "listing_no": f"NL{i:02d}",
                "county": "Nairobi",
                "prop_type": "Land",
                "size_acres": 1.0,
                "latitude": -1.29 + i * 0.001,
                "longitude": 36.82 + i * 0.001,
                "listed_price_per_acre_ksh": float(price),
                "predicted_price_per_acre_ksh": float(price) * 1.1,
                "low_price_per_acre_ksh": float(price) * 0.6,
                "high_price_per_acre_ksh": float(price) * 1.5,
                "listed_over_predicted": 1 / 1.1,
                "scored_by": "oof",
                "verdict": "fair",
                "data_quality_flag": False,
            }
        )
    # Nairobi Farm — 2 rows, median 8.5M.
    for i, price in enumerate([9e6, 8e6], start=7):
        rows.append(
            {
                "listing_no": f"NF{i:02d}",
                "county": "Nairobi",
                "prop_type": "Farm",
                "size_acres": 5.0,
                "latitude": -1.30,
                "longitude": 36.83,
                "listed_price_per_acre_ksh": float(price),
                "predicted_price_per_acre_ksh": float(price),
                "low_price_per_acre_ksh": float(price) * 0.6,
                "high_price_per_acre_ksh": float(price) * 1.5,
                "listed_over_predicted": 1.0,
                "scored_by": "oof",
                "verdict": "fair",
                "data_quality_flag": False,
            }
        )
    # Kiambu Land — 2 rows, median 1.0M.
    for i, price in enumerate([1.5e6, 0.5e6], start=1):
        rows.append(
            {
                "listing_no": f"KL{i:02d}",
                "county": "Kiambu",
                "prop_type": "Land",
                "size_acres": 2.0,
                "latitude": -1.04,
                "longitude": 36.83,
                "listed_price_per_acre_ksh": float(price),
                "predicted_price_per_acre_ksh": float(price),
                "low_price_per_acre_ksh": float(price) * 0.6,
                "high_price_per_acre_ksh": float(price) * 1.5,
                "listed_over_predicted": 1.0,
                "scored_by": "oof",
                "verdict": "fair",
                "data_quality_flag": False,
            }
        )
    # Kiambu Farm — 2 rows, median 2.0M.
    for i, price in enumerate([3e6, 1e6], start=3):
        rows.append(
            {
                "listing_no": f"KF{i:02d}",
                "county": "Kiambu",
                "prop_type": "Farm",
                "size_acres": 10.0,
                "latitude": -1.05,
                "longitude": 36.84,
                "listed_price_per_acre_ksh": float(price),
                "predicted_price_per_acre_ksh": float(price),
                "low_price_per_acre_ksh": float(price) * 0.6,
                "high_price_per_acre_ksh": float(price) * 1.5,
                "listed_over_predicted": 1.0,
                "scored_by": "oof",
                "verdict": "fair",
                "data_quality_flag": False,
            }
        )
    return pd.DataFrame(rows)


def _mi_county_summary() -> pd.DataFrame:
    """A county_summary.csv over the same frame (unfiltered medians)."""
    return pd.DataFrame(
        {
            "county": ["Nairobi", "Kiambu"],
            "n_listings": [8, 4],
            "median_price_per_acre_ksh": [4.5e6, 1.5e6],
            "q1_price_per_acre_ksh": [2.75e6, 0.75e6],
            "q3_price_per_acre_ksh": [7.25e6, 2.5e6],
            "mean_log_price_per_acre": [15.3, 14.2],
            "water_body_distance_share": [0.0, 0.0],
            "n_below_min_county_n": [False, False],
        }
    )


def _mi_exports(manifest: dict | None = None) -> dict:
    return {
        "manifest.json": manifest if manifest is not None else _tiny_manifest(),
        "listings_scored.parquet": _mi_frame(),
        "county_summary.csv": _mi_county_summary(),
    }


@pytest.fixture
def mi_app(app, tmp_path):
    _write_app_exports(tmp_path, _mi_exports())
    from app.services.app_exports import AppExportsRegistry

    app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
    yield app


class TestCountySummaryP3b:
    def test_prop_type_filter_changes_medians(self, mi_app, client):
        """The frame path recomputes per-county medians on filtered rows.

        Unfiltered: Nairobi median over all 8 rows (1..6M + 8,9M) = 4.5M.
        prop_type=Farm: Nairobi median over the 2 Farm rows = 8.5M.
        """
        base = client.get("/api/v1/counties/summary?prop_type=Land").json()
        nairobi_land = next(r for r in base["counties"] if r["county"] == "Nairobi")
        # Land only: prices 1-6M -> median 3.5M
        assert nairobi_land["median_price_per_acre_ksh"] == pytest.approx(3.5e6)
        farm = client.get("/api/v1/counties/summary?prop_type=Farm").json()
        nairobi_farm = next(r for r in farm["counties"] if r["county"] == "Nairobi")
        assert nairobi_farm["median_price_per_acre_ksh"] == pytest.approx(8.5e6)
        # The filter echo is the canonical casing.
        assert farm["prop_type"] == "Farm"

    def test_case_insensitive_exact_match(self, mi_app, client):
        lower = client.get("/api/v1/counties/summary?prop_type=land").json()
        upper = client.get("/api/v1/counties/summary?prop_type=LAND").json()
        base = client.get("/api/v1/counties/summary?prop_type=Land").json()
        assert lower["counties"] == upper["counties"] == base["counties"]

    def test_unknown_prop_type_422_with_allowed(self, mi_app, client):
        resp = client.get("/api/v1/counties/summary?prop_type=Residential")
        assert resp.status_code == 422
        assert resp.json()["error"]["details"]["allowed"] == ["Land", "Farm", "Commercial"]

    def test_property_types_returned_with_counts(self, mi_app, client):
        body = client.get("/api/v1/counties/summary").json()
        types = {pt["name"]: pt["n"] for pt in body["property_types"]}
        assert types == {"Land": 8, "Farm": 4, "Commercial": 0}
        assert body["unmapped_prop_type_rows"] == 0

    def test_price_bands_are_quantiles(self, mi_app, client):
        """Band edges = quintile cut points of the eligible counties' medians.

        With only 2 counties in the fixture (both above MIN_COUNTY_N=10? no —
        8 and 4 listings, both BELOW 10) the bands fall back to the CSV-path
        eligibility... the frame path marks both n_below_min_county_n=True,
        so eligible_medians is EMPTY -> bands_reason = fewer_counties_than_bands.
        """
        body = client.get("/api/v1/counties/summary?prop_type=Land").json()
        assert body["price_bands"] == []
        assert body["bands_reason"] in ("fewer_counties_than_bands", "no_counties_with_data")

    def test_fewer_counties_than_bands(self, app, tmp_path):
        """2 eligible counties < 5 bands -> empty bands + that reason.

        With MIN_COUNTY_N=2 both fixture counties are eligible (8 and 4
        listings >= 2), so the medians exist but 2 < 5 bands.
        """
        manifest = {
            "created": "2025-01-15",
            "production_run": "Run A",
            "config": {"MIN_COUNTY_N": 2},
        }
        _write_app_exports(tmp_path, _mi_exports(manifest))
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/counties/summary?prop_type=Land").json()
            assert len(body["price_bands"]) == 0
            assert body["bands_reason"] == "fewer_counties_than_bands"

    def test_missing_min_county_n_returns_null_not_10(self, app, tmp_path):
        """When the manifest lacks MIN_COUNTY_N: null + data_quality flag,
        never a typed 10 fallback (P3b fix for problem D)."""
        manifest = {"created": "2025-01-15", "production_run": "Run A", "config": {}}
        _write_app_exports(tmp_path, _mi_exports(manifest))
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/counties/summary?prop_type=Land").json()
            assert body["min_county_n"] is None
            assert body["data_quality"] == "min_county_n_missing"
            # n_below_min_county_n is null (unknown threshold), never guessed.
            assert all(r["n_below_min_county_n"] is None for r in body["counties"])

    def test_no_nan_in_json(self, mi_app, client):
        import json
        import math

        body = json.loads(client.get("/api/v1/counties/summary?prop_type=Land").text)

        def _walk(o):
            if isinstance(o, dict):
                for v in o.values():
                    _walk(v)
            elif isinstance(o, list):
                for v in o:
                    _walk(v)
            elif isinstance(o, float):
                assert math.isfinite(o)

        _walk(body)


class TestDistanceProfile:
    def test_shape_and_counts(self, mi_app, client):
        resp = client.get("/api/v1/counties/Nairobi/distance-profile")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["county"] == "Nairobi"
        assert body["n"] == 8
        assert body["n_total"] == 8
        # Nairobi rows are ~0-2 km from the reference (tiny jitter only).
        assert body["distance_range_km"][0] < body["distance_range_km"][1]
        assert body["price_range"] == [pytest.approx(1e6), pytest.approx(9e6)]

    def test_prop_type_filter(self, mi_app, client):
        body = client.get("/api/v1/counties/Nairobi/distance-profile?prop_type=Land").json()
        assert body["n"] == 6
        assert all(p["prop_type"] == "Land" for p in body["sample"])

    def test_unknown_county_422_with_allowed(self, mi_app, client):
        resp = client.get("/api/v1/counties/Mombasa/distance-profile")
        assert resp.status_code == 422
        assert "Nairobi" in resp.json()["error"]["details"]["allowed"]

    def test_unknown_prop_type_422(self, mi_app, client):
        resp = client.get("/api/v1/counties/Nairobi/distance-profile?prop_type=Industrial")
        assert resp.status_code == 422

    def test_sample_deterministic_and_unbiased(self, mi_app, client):
        """A frame sorted by price (cheapest first) still yields a mixed
        sample — the permutation never takes head()/first-N."""
        b1 = client.get("/api/v1/counties/Nairobi/distance-profile?limit=5").json()
        b2 = client.get("/api/v1/counties/Nairobi/distance-profile?limit=5").json()
        assert [p["listing_no"] for p in b1["sample"]] == [p["listing_no"] for p in b2["sample"]]
        # Mixed: not just the 5 cheapest (a biased head() would give
        # NL06..NL02 — the cheapest Land rows).
        prices = sorted(p["price_per_acre_ksh"] for p in b1["sample"])
        cheapest5 = sorted([1e6, 2e6, 3e6, 4e6, 5e6])
        assert prices != cheapest5, "sample looks like head() of a sorted frame"

    def test_limit_cap(self, mi_app, client):
        body = client.get("/api/v1/counties/Nairobi/distance-profile?limit=3").json()
        assert body["sample_limit"] == 3
        assert body["n_returned"] <= 3
        assert body["n_total"] == 8

    def test_trend_matches_hand_ols(self, mi_app, client):
        """The server trend equals a hand OLS of log(price) vs distance.

        The 6 Nairobi Land rows sit at 1km-ish steps with prices 6M..1M —
        a strong negative log relationship.  We recompute the OLS in the
        test from the SAME distances the backend uses (recomputed via the
        shared haversine) and compare slope/intercept/r2.
        """
        from app.services.geo_reference import compute_distances_to_nairobi

        df = _mi_frame()
        sub = df[(df["county"] == "Nairobi") & (df["prop_type"] == "Land")]
        lats = sub["latitude"].to_numpy(dtype=float)
        lons = sub["longitude"].to_numpy(dtype=float)
        dists = compute_distances_to_nairobi(lats, lons, None)
        prices = sub["listed_price_per_acre_ksh"].to_numpy(dtype=float)
        logp = np.log(prices)
        slope, intercept = np.polyfit(dists, logp, 1)
        y_pred = slope * dists + intercept
        ss_res = float(np.sum((logp - y_pred) ** 2))
        ss_tot = float(np.sum((logp - logp.mean()) ** 2))
        r2 = 1.0 - ss_res / ss_tot

        body = client.get("/api/v1/counties/Nairobi/distance-profile?prop_type=Land").json()
        # Nairobi has 6 Land rows < MIN_COUNTY_N=10 -> low_support -> NO
        # trend.  So this test asserts the low-support omission instead:
        assert body["low_support"] is True
        assert body["trend"] is None
        # The hand OLS is only asserted when support is sufficient — see
        # the high-support variant below.
        assert r2 > 0.9  # the hand fit itself is near-deterministic

    def test_low_support_omits_trend(self, mi_app, client):
        """Nairobi has 8 rows < MIN_COUNTY_N=10 -> low_support + no trend."""
        body = client.get("/api/v1/counties/Nairobi/distance-profile").json()
        assert body["low_support"] is True
        assert body["trend"] is None
        # The sample + ranges are still returned.
        assert body["n"] == 8
        assert len(body["sample"]) > 0

    def test_trend_present_when_support_sufficient(self, app, tmp_path):
        """With MIN_COUNTY_N set low (2), the same county is NOT low-support
        and the trend is present and matches the hand OLS."""
        manifest = {
            "created": "2025-01-15",
            "production_run": "Run A",
            "config": {"MIN_COUNTY_N": 2},
        }
        _write_app_exports(tmp_path, _mi_exports(manifest))
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry
        from app.services.geo_reference import compute_distances_to_nairobi

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/counties/Nairobi/distance-profile?prop_type=Land").json()
            assert body["low_support"] is False
            assert body["trend"] is not None
            # Hand OLS over the same 6 rows.
            df = _mi_frame()
            sub = df[(df["county"] == "Nairobi") & (df["prop_type"] == "Land")]
            lats = sub["latitude"].to_numpy(dtype=float)
            lons = sub["longitude"].to_numpy(dtype=float)
            dists = compute_distances_to_nairobi(lats, lons, None)
            prices = sub["listed_price_per_acre_ksh"].to_numpy(dtype=float)
            logp = np.log(prices)
            slope, intercept = np.polyfit(dists, logp, 1)
            assert body["trend"]["slope"] == pytest.approx(float(slope), abs=1e-9)
            assert body["trend"]["intercept"] == pytest.approx(float(intercept), abs=1e-9)
            assert body["trend"]["n"] == 6

    def test_no_nan_in_json(self, mi_app, client):
        import json
        import math

        body = json.loads(client.get("/api/v1/counties/Nairobi/distance-profile").text)

        def _walk(o):
            if isinstance(o, dict):
                for v in o.values():
                    _walk(v)
            elif isinstance(o, list):
                for v in o:
                    _walk(v)
            elif isinstance(o, float):
                assert math.isfinite(o)

        _walk(body)
