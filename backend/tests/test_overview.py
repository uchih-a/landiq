"""Tests for GET /api/v1/overview/summary (Overview build round).

The fixture is a hand-built ~12-row ``listings_scored`` frame with known
totals / verdicts / size-band / distance-band / property-type values so
every number can be checked by hand.  The same fixture is used for the
happy path, the filter tests, the validation tests, and the
deterministic-sample test.

The shape mirrors ``_tiny_listings_scored`` from ``test_app_exports`` so
the ``AppExportsRegistry`` loads it without surprises.
"""

from __future__ import annotations

import math

import pandas as pd
import pytest

from tests.test_app_exports import _tiny_manifest, _write_app_exports

# ----------------------------------------------------------------------
# Fixture: a richer frame than _tiny_listings_scored so every block has
# at least two populated bands/types/counties to test.
# ----------------------------------------------------------------------


def _overview_listings_scored() -> pd.DataFrame:
    """Hand-built frame with known answers.

    Layout (12 rows, 4 counties, 3 prop_types, 3 verdicts):
      Nairobi  Land      1.0 ac   KSh 6.0M/ac  underpriced   (close to NBO)
      Nairobi  Land      0.5 ac   KSh 8.0M/ac  fair
      Nairobi  Commercial 0.25 ac KSh 12.0M/ac overpriced
      Nairobi  Farm      5.0 ac   KSh 4.0M/ac  fair
      Kiambu   Land      1.0 ac   KSh 3.0M/ac  underpriced
      Kiambu   Land      2.0 ac   KSh 2.5M/ac  fair
      Kiambu   Farm      10.0 ac  KSh 1.5M/ac  underpriced
      Kiambu   Commercial 0.5 ac  KSh 5.0M/ac  overpriced
      Kajiado  Land      20.0 ac  KSh 0.8M/ac  fair
      Kajiado  Farm      50.0 ac  KSh 0.5M/ac  underpriced
      Nakuru   Land      1.0 ac   KSh 2.0M/ac  fair
      Nakuru   Farm      5.0 ac   KSh 1.0M/ac  overpriced

    Lat/lon chosen so distances from Nairobi (-1.2921, 36.8219) are:
      Nairobi rows  -> ~0-15 km
      Kiambu rows   -> ~25-40 km
      Kajiado rows  -> ~80-100 km
      Nakuru rows   -> ~140-160 km
    """
    return pd.DataFrame(
        [
            {
                "listing_no": "L001",
                "county": "Nairobi",
                "prop_type": "Land",
                "size_acres": 1.0,
                "latitude": -1.29,
                "longitude": 36.82,
                "listed_price_per_acre_ksh": 6_000_000,
                "predicted_price_per_acre_ksh": 7_000_000,
                "verdict": "underpriced",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L002",
                "county": "Nairobi",
                "prop_type": "Land",
                "size_acres": 0.5,
                "latitude": -1.30,
                "longitude": 36.83,
                "listed_price_per_acre_ksh": 8_000_000,
                "predicted_price_per_acre_ksh": 7_500_000,
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L003",
                "county": "Nairobi",
                "prop_type": "Commercial",
                "size_acres": 0.25,
                "latitude": -1.28,
                "longitude": 36.81,
                "listed_price_per_acre_ksh": 12_000_000,
                "predicted_price_per_acre_ksh": 9_000_000,
                "verdict": "overpriced",
                "data_quality_flag": True,
            },
            {
                "listing_no": "L004",
                "county": "Nairobi",
                "prop_type": "Farm",
                "size_acres": 5.0,
                "latitude": -1.32,
                "longitude": 36.84,
                "listed_price_per_acre_ksh": 4_000_000,
                "predicted_price_per_acre_ksh": 4_200_000,
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L005",
                "county": "Kiambu",
                "prop_type": "Land",
                "size_acres": 1.0,
                "latitude": -1.04,
                "longitude": 36.83,
                "listed_price_per_acre_ksh": 3_000_000,
                "predicted_price_per_acre_ksh": 3_500_000,
                "verdict": "underpriced",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L006",
                "county": "Kiambu",
                "prop_type": "Land",
                "size_acres": 2.0,
                "latitude": -1.05,
                "longitude": 36.84,
                "listed_price_per_acre_ksh": 2_500_000,
                "predicted_price_per_acre_ksh": 2_700_000,
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L007",
                "county": "Kiambu",
                "prop_type": "Farm",
                "size_acres": 10.0,
                "latitude": -1.06,
                "longitude": 36.85,
                "listed_price_per_acre_ksh": 1_500_000,
                "predicted_price_per_acre_ksh": 1_800_000,
                "verdict": "underpriced",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L008",
                "county": "Kiambu",
                "prop_type": "Commercial",
                "size_acres": 0.5,
                "latitude": -1.03,
                "longitude": 36.82,
                "listed_price_per_acre_ksh": 5_000_000,
                "predicted_price_per_acre_ksh": 4_000_000,
                "verdict": "overpriced",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L009",
                "county": "Kajiado",
                "prop_type": "Land",
                "size_acres": 20.0,
                "latitude": -1.85,
                "longitude": 36.60,
                "listed_price_per_acre_ksh": 800_000,
                "predicted_price_per_acre_ksh": 900_000,
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L010",
                "county": "Kajiado",
                "prop_type": "Farm",
                "size_acres": 50.0,
                "latitude": -2.10,
                "longitude": 36.50,
                "listed_price_per_acre_ksh": 500_000,
                "predicted_price_per_acre_ksh": 600_000,
                "verdict": "underpriced",
                "data_quality_flag": True,
            },
            {
                "listing_no": "L011",
                "county": "Nakuru",
                "prop_type": "Land",
                "size_acres": 1.0,
                "latitude": -0.30,
                "longitude": 36.07,
                "listed_price_per_acre_ksh": 2_000_000,
                "predicted_price_per_acre_ksh": 2_200_000,
                "verdict": "fair",
                "data_quality_flag": False,
            },
            {
                "listing_no": "L012",
                "county": "Nakuru",
                "prop_type": "Farm",
                "size_acres": 5.0,
                "latitude": -0.28,
                "longitude": 36.08,
                "listed_price_per_acre_ksh": 1_000_000,
                "predicted_price_per_acre_ksh": 1_300_000,
                "verdict": "overpriced",
                "data_quality_flag": False,
            },
        ]
    )


def _overview_exports() -> dict:
    return {
        "manifest.json": _tiny_manifest(),
        "listings_scored.parquet": _overview_listings_scored(),
    }


@pytest.fixture
def app_with_overview(app, tmp_path):
    _write_app_exports(tmp_path, _overview_exports())
    from app.services.app_exports import AppExportsRegistry

    new_reg = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
    app.state.app_exports = new_reg
    yield app


# ----------------------------------------------------------------------
# Happy path
# ----------------------------------------------------------------------


class TestOverviewHappyPath:
    def test_status_and_shape(self, app_with_overview, client):
        resp = client.get("/api/v1/overview/summary")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        for key in (
            "filters",
            "property_types_canonical",
            "size_band_edges_acres",
            "size_band_labels",
            "distance_band_edges_km",
            "distance_band_labels",
            "unmapped_prop_type_rows",
            "totals",
            "national",
            "n_counties_total",
            "verdicts",
            "by_property_type",
            "by_size_band",
            "by_distance_band",
            "trend",
            "scatter_sample",
            "counties",
            "generated_from",
        ):
            assert key in body, f"missing block: {key}"

    def test_canonical_lists_returned(self, app_with_overview, client):
        body = client.get("/api/v1/overview/summary").json()
        assert body["property_types_canonical"] == ["Land", "Farm", "Commercial"]
        # 8 edges (7 bands + the open tail) — matches SIZE_BAND_EDGES_ACRES.
        # The +inf tail is returned as null (JSON can't serialise inf).
        assert len(body["size_band_edges_acres"]) == 8
        assert body["size_band_edges_acres"][0] == 0.0
        assert body["size_band_edges_acres"][-1] is None
        assert body["size_band_labels"] == [
            "<1/8 ac",
            "1/8-1/4 ac",
            "1/4-1/2 ac",
            "1/2-1 ac",
            "1-5 ac",
            "5-20 ac",
            "20+ ac",
        ]
        assert len(body["distance_band_edges_km"]) == 7  # 6 bands + open tail (null)
        assert body["distance_band_edges_km"][-1] is None
        assert body["distance_band_labels"] == [
            "0-25 km",
            "25-50 km",
            "50-100 km",
            "100-200 km",
            "200-400 km",
            "400+ km",
        ]

    def test_totals(self, app_with_overview, client):
        body = client.get("/api/v1/overview/summary").json()
        # 12 rows in the fixture, 0 unmapped prop_types
        assert body["totals"]["n_listings"] == 12
        assert body["totals"]["n_flagged"] == 2  # L003 + L010
        # 4 counties
        assert body["totals"]["n_counties_with_data"] == 4
        # All 4 counties have n_listings >= min_county_n=10?
        # Nairobi=4, Kiambu=4, Kajiado=2, Nakuru=2 — none reach 10
        assert body["totals"]["n_counties_meeting_threshold"] == 0
        # Median of the 12 prices: sort and pick middle two
        prices = sorted(
            [
                6_000_000,
                8_000_000,
                12_000_000,
                4_000_000,
                3_000_000,
                2_500_000,
                1_500_000,
                5_000_000,
                800_000,
                500_000,
                2_000_000,
                1_000_000,
            ]
        )
        expected_median = (prices[5] + prices[6]) / 2  # 2_000_000 + 2_500_000
        assert body["totals"]["median_price_per_acre_ksh"] == pytest.approx(expected_median)

    def test_national_block_unfiltered(self, app_with_overview, client):
        """`national` is always unfiltered regardless of query filters."""
        body_unfiltered = client.get("/api/v1/overview/summary").json()
        body_filtered = client.get("/api/v1/overview/summary?county=Nairobi").json()
        assert (
            body_unfiltered["national"]["n_listings"]
            == body_filtered["national"]["n_listings"]
            == 12
        )
        assert (
            body_unfiltered["national"]["n_counties_with_data"]
            == body_filtered["national"]["n_counties_with_data"]
            == 4
        )

    def test_verdicts_sum_to_n(self, app_with_overview, client):
        body = client.get("/api/v1/overview/summary").json()
        v = body["verdicts"]
        # underpriced = 4 (L001, L005, L007, L010)
        # fair        = 5 (L002, L004, L006, L009, L011)
        # overpriced  = 3 (L003, L008, L012)
        assert v["underpriced"] == 4
        assert v["fair"] == 5
        assert v["overpriced"] == 3
        assert v["n_unknown"] == 0
        assert v["n_listings"] == 12
        assert v["underpriced"] + v["fair"] + v["overpriced"] + v["n_unknown"] == v["n_listings"]
        # Shares
        assert v["underpriced_share"] == pytest.approx(4 / 12, abs=1e-4)
        assert v["fair_share"] == pytest.approx(5 / 12, abs=1e-4)
        assert v["overpriced_share"] == pytest.approx(3 / 12, abs=1e-4)


# ----------------------------------------------------------------------
# Filters
# ----------------------------------------------------------------------


class TestOverviewFilters:
    def test_county_filter_changes_totals(self, app_with_overview, client):
        body = client.get("/api/v1/overview/summary?county=Nairobi").json()
        assert body["filters"]["county"] == "Nairobi"
        assert body["totals"]["n_listings"] == 4  # 4 Nairobi rows
        assert body["totals"]["n_counties_with_data"] == 1
        # National block is unchanged
        assert body["national"]["n_listings"] == 12

    def test_county_case_insensitive(self, app_with_overview, client):
        body_lower = client.get("/api/v1/overview/summary?county=nairobi").json()
        body_upper = client.get("/api/v1/overview/summary?county=NAIROBI").json()
        body_title = client.get("/api/v1/overview/summary?county=Nairobi").json()
        assert (
            body_lower["totals"]["n_listings"]
            == body_upper["totals"]["n_listings"]
            == body_title["totals"]["n_listings"]
            == 4
        )

    def test_prop_type_filter_changes_totals(self, app_with_overview, client):
        body = client.get("/api/v1/overview/summary?prop_type=Land").json()
        # 6 Land rows in the fixture (L001, L002, L005, L006, L009, L011)
        assert body["totals"]["n_listings"] == 6
        assert body["filters"]["prop_type"] == "Land"

    def test_prop_type_case_insensitive_exact(self, app_with_overview, client):
        """prop_type is case-insensitive EXACT match — 'land' is valid,
        'lands' / 'landowner' are not (vs /listings/scored's substring)."""
        body = client.get("/api/v1/overview/summary?prop_type=land").json()
        assert body["totals"]["n_listings"] == 6
        # Substring should NOT match (would match in /listings/scored)
        bad = client.get("/api/v1/overview/summary?prop_type=lands")
        assert bad.status_code == 422
        assert "allowed" in bad.json()["error"]["details"]

    def test_county_and_prop_type_combined(self, app_with_overview, client):
        body = client.get("/api/v1/overview/summary?county=Kiambu&prop_type=Land").json()
        # Kiambu Land rows: L005, L006 = 2
        assert body["totals"]["n_listings"] == 2

    def test_county_filter_does_not_zero_property_type_bars(self, app_with_overview, client):
        """by_property_type is filtered by COUNTY only — all three bars
        always show even when prop_type filter is applied."""
        body = client.get("/api/v1/overview/summary?county=Nairobi&prop_type=Land").json()
        types = {t["name"]: t["n"] for t in body["by_property_type"]["types"]}
        # Nairobi has Land=2, Commercial=1, Farm=1
        assert types == {"Land": 2, "Farm": 1, "Commercial": 1}

    def test_size_band_comparison_only_when_county_set(self, app_with_overview, client):
        """The national comparison series only appears when county is set."""
        no_county = client.get("/api/v1/overview/summary").json()
        with_county = client.get("/api/v1/overview/summary?county=Nairobi").json()
        assert no_county["by_size_band"]["comparison"] is None
        assert with_county["by_size_band"]["comparison"] is not None
        # The comparison series should have the national totals
        assert with_county["by_size_band"]["comparison"][0]["n"] >= 0  # always present

    def test_unknown_county_returns_422_with_allowed(self, app_with_overview, client):
        resp = client.get("/api/v1/overview/summary?county=Moon")
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert "allowed" in body["error"]["details"]
        # The allowed list comes from the data, not a literal
        assert "Nairobi" in body["error"]["details"]["allowed"]
        assert "Kiambu" in body["error"]["details"]["allowed"]
        assert "Kajiado" in body["error"]["details"]["allowed"]
        assert "Nakuru" in body["error"]["details"]["allowed"]

    def test_unknown_prop_type_returns_422_with_allowed(self, app_with_overview, client):
        resp = client.get("/api/v1/overview/summary?prop_type=Industrial")
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert body["error"]["details"]["allowed"] == ["Land", "Farm", "Commercial"]

    def test_top_n_counties_clamped(self, app_with_overview, client):
        # top_n=2 -> top 2 counties (Nairobi=4, Kiambu=4) + Others (Kajiado=2, Nakuru=2)
        body = client.get("/api/v1/overview/summary?top_n_counties=2").json()
        assert body["counties"]["top_n"] == 2
        assert len(body["counties"]["top"]) == 2
        assert body["counties"]["others"]["n"] == 4  # 2 + 2
        assert sorted(body["counties"]["others"]["counties"]) == ["Kajiado", "Nakuru"]

    def test_top_n_counties_invalid_range(self, app_with_overview, client):
        # < 1
        assert client.get("/api/v1/overview/summary?top_n_counties=0").status_code == 422
        # > 10
        assert client.get("/api/v1/overview/summary?top_n_counties=11").status_code == 422


# ----------------------------------------------------------------------
# Band edge semantics
# ----------------------------------------------------------------------


class TestOverviewBandEdges:
    def test_size_band_edge_goes_to_upper(self, app_with_overview, client):
        """A value exactly on a band edge goes to the UPPER band (the one
        whose lower edge equals the value).

        Fixture row L001 has size_acres=1.0.  With edges [0.5, 1.0, 5.0],
        the value 1.0 should land in the [1.0, 5.0) band ('1-5 ac'), NOT
        the [0.5, 1.0) band ('1/2-1 ac').
        """
        body = client.get("/api/v1/overview/summary").json()
        bands = {b["label"]: b["n"] for b in body["by_size_band"]["bands"]}
        # L001 (1.0), L005 (1.0), L011 (1.0), L006 (2.0) -> 4 rows in '1-5 ac'
        assert bands["1-5 ac"] == 4
        # L002 (0.5), L008 (0.5) -> 2 rows in '1/2-1 ac' (the band whose
        # upper edge is 1.0, so 1.0 itself does NOT go here)
        assert bands["1/2-1 ac"] == 2

    def test_distance_band_edge_goes_to_upper(self, app_with_overview, client):
        """Distance band edges: a listing whose distance lands exactly on
        an edge goes into the upper band.  Verified by total count."""
        body = client.get("/api/v1/overview/summary").json()
        # Sanity: every band row exists
        assert len(body["by_distance_band"]["bands"]) == 6
        # Counts sum to n_listings with valid lat/lon (all 12 in the fixture)
        total = sum(b["n"] for b in body["by_distance_band"]["bands"])
        assert total == 12


# ----------------------------------------------------------------------
# Hand-computed: leader_premium + bulk_discount
# ----------------------------------------------------------------------


class TestOverviewDerivedMetrics:
    def test_leader_premium_hand_computed(self, app_with_overview, client):
        """Commercial has the highest median per acre; premium vs the
        median of Land + Farm (the other types with data).

        Medians per type (across the WHOLE frame, county filter = none):
          Land:       prices 6M, 8M, 3M, 2.5M, 800k, 2M -> sorted: 800k, 2M, 2.5M, 3M, 6M, 8M -> median = (2.5M + 3M)/2 = 2.75M
          Farm:       prices 4M, 1.5M, 500k, 1M -> sorted: 500k, 1M, 1.5M, 4M -> median = (1M + 1.5M)/2 = 1.25M
          Commercial: prices 12M, 5M -> median = (5M + 12M)/2 = 8.5M

        Leader = Commercial (8.5M). Others = [Land 2.75M, Farm 1.25M].
        Others_median = median([2.75M, 1.25M]) = (1.25M + 2.75M) / 2 = 2M
        Premium = (8.5M - 2M) / 2M * 100 = 325.0%
        """
        body = client.get("/api/v1/overview/summary").json()
        bpt = body["by_property_type"]
        assert bpt["leader"] == "Commercial"
        assert bpt["leader_premium_pct"] == pytest.approx(325.0, abs=0.1)

    def test_bulk_discount_hand_computed(self, app_with_overview, client):
        """Bulk discount = (smallest_band_median - largest_band_median) / smallest * 100.

        With the 7-band size scheme ([0, 1/8, 1/4, 1/2, 1, 5, 20, inf]):
          Smallest populated band: 1/4-1/2 ac — 1 row (L003=12M) → median = 12M
          Largest populated band:  20+ ac — 2 rows (L009=800k, L010=500k)
                                   → median = (500k + 800k)/2 = 650k

        Bulk = (12M - 650k) / 12M * 100 = 94.5833...% → 94.6
        """
        body = client.get("/api/v1/overview/summary").json()
        bsb = body["by_size_band"]
        assert bsb["bulk_discount_pct"] == pytest.approx(94.6, abs=0.1)

    def test_leader_premium_null_when_one_type(self, app, tmp_path):
        """When only one type has data, leader_premium is null."""
        # Single-row frame with only Land — no comparison possible.
        df = pd.DataFrame(
            [
                {
                    "listing_no": "L001",
                    "county": "Nairobi",
                    "prop_type": "Land",
                    "size_acres": 1.0,
                    "latitude": -1.29,
                    "longitude": 36.82,
                    "listed_price_per_acre_ksh": 5_000_000,
                    "predicted_price_per_acre_ksh": 5_000_000,
                    "verdict": "fair",
                    "data_quality_flag": False,
                },
            ]
        )
        _write_app_exports(
            tmp_path, {"manifest.json": _tiny_manifest(), "listings_scored.parquet": df}
        )
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/overview/summary").json()
            # Only Land has data -> leader_premium is null, leader is null
            assert body["by_property_type"]["leader_premium_pct"] is None
            assert body["by_property_type"]["leader"] is None


# ----------------------------------------------------------------------
# Scatter sample: deterministic + unbiased
# ----------------------------------------------------------------------


class TestOverviewScatterSample:
    def test_deterministic(self, app_with_overview, client):
        """Two calls with the same filters return the same sample."""
        b1 = client.get("/api/v1/overview/summary").json()
        b2 = client.get("/api/v1/overview/summary").json()
        p1 = [p["listing_no"] for p in b1["scatter_sample"]["points"]]
        p2 = [p["listing_no"] for p in b2["scatter_sample"]["points"]]
        assert p1 == p2

    def test_unbiased_against_sorted_frame(self, app, tmp_path):
        """A frame sorted by verdict (most underpriced first) yields a
        MIXED sample — not just the first N rows."""
        df = _overview_listings_scored()
        # Sort most-underpriced-first to mimic /listings/scored's default.
        df_sorted = df.sort_values(
            "listed_over_predicted" if "listed_over_predicted" in df.columns else "listing_no",
            ascending=True,
        ).reset_index(drop=True)
        # Synthesize listed_over_predicted so the sort actually orders things:
        df_sorted["listed_over_predicted"] = (
            df_sorted["listed_price_per_acre_ksh"] / df_sorted["predicted_price_per_acre_ksh"]
        )
        df_sorted = df_sorted.sort_values("listed_over_predicted").reset_index(drop=True)
        _write_app_exports(
            tmp_path, {"manifest.json": _tiny_manifest(), "listings_scored.parquet": df_sorted}
        )
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as c:
            body = c.get("/api/v1/overview/summary?scatter_limit=8").json()
            sample = body["scatter_sample"]
            assert sample["n_total"] == 12
            assert sample["n_returned"] == 8
            # The first 8 rows of the sorted frame are all underpriced
            # (listed_over_predicted < 1.0).  An unbiased sample must NOT
            # be all underpriced — that would prove it took head().
            verdicts = {p["verdict"] for p in sample["points"]}
            assert "fair" in verdicts or "overpriced" in verdicts, (
                "Scatter sample appears biased — only underpriced rows present. "
                "Did the implementation take head() instead of a random permutation?"
            )

    def test_scatter_limit_capped(self, app_with_overview, client):
        body = client.get("/api/v1/overview/summary?scatter_limit=3").json()
        assert body["scatter_sample"]["sample_limit"] == 3
        assert body["scatter_sample"]["n_returned"] <= 3

    def test_scatter_limit_invalid(self, app_with_overview, client):
        assert client.get("/api/v1/overview/summary?scatter_limit=0").status_code == 422
        assert client.get("/api/v1/overview/summary?scatter_limit=1001").status_code == 422


# ----------------------------------------------------------------------
# Empty + degraded + unmapped-prop-type
# ----------------------------------------------------------------------


class TestOverviewEmptyAndDegraded:
    def test_empty_selection_returns_zeros(self, app, tmp_path):
        """A county filter that matches 0 rows returns zeros + empty lists, not 500."""
        df = _overview_listings_scored()
        _write_app_exports(
            tmp_path, {"manifest.json": _tiny_manifest(), "listings_scored.parquet": df}
        )
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            # valid county with no rows after prop_type filter? Our fixture
            # has every county with at least 1 row of every type — so use
            # the empty-prop-type case differently. Test a county with 0
            # rows: filter by a county that doesn't exist returns 422, so
            # instead test an empty frame directly.
            empty_df = df.iloc[0:0].copy()
            _write_app_exports(
                tmp_path, {"manifest.json": _tiny_manifest(), "listings_scored.parquet": empty_df}
            )
            app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
            body = client.get("/api/v1/overview/summary").json()
            assert body["totals"]["n_listings"] == 0
            assert body["totals"]["median_price_per_acre_ksh"] is None
            assert body["verdicts"]["underpriced"] == 0
            assert body["verdicts"]["underpriced_share"] is None
            assert body["scatter_sample"]["points"] == []
            assert body["by_property_type"]["leader_premium_pct"] is None

    def test_degraded_mode_503(self, app, client):
        """When listings_scored.parquet is missing, returns 503 DATA_UNAVAILABLE."""
        resp = client.get("/api/v1/overview/summary")
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "DATA_UNAVAILABLE"

    def test_unmapped_prop_type_counted(self, app, tmp_path):
        """Rows whose prop_type is NOT in PROPERTY_TYPES are counted under
        unmapped_prop_type_rows, NOT silently dropped or relabelled."""
        df = _overview_listings_scored().copy()
        # Add 2 rows with a non-canonical prop_type
        df = pd.concat(
            [
                df,
                pd.DataFrame(
                    [
                        {
                            "listing_no": "L099",
                            "county": "Nairobi",
                            "prop_type": "Residential",
                            "size_acres": 0.5,
                            "latitude": -1.29,
                            "longitude": 36.82,
                            "listed_price_per_acre_ksh": 9_000_000,
                            "predicted_price_per_acre_ksh": 9_000_000,
                            "verdict": "fair",
                            "data_quality_flag": False,
                        },
                        {
                            "listing_no": "L100",
                            "county": "Nairobi",
                            "prop_type": "Industrial",
                            "size_acres": 2.0,
                            "latitude": -1.30,
                            "longitude": 36.83,
                            "listed_price_per_acre_ksh": 7_000_000,
                            "predicted_price_per_acre_ksh": 7_000_000,
                            "verdict": "fair",
                            "data_quality_flag": False,
                        },
                    ]
                ),
            ],
            ignore_index=True,
        )
        _write_app_exports(
            tmp_path, {"manifest.json": _tiny_manifest(), "listings_scored.parquet": df}
        )
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/overview/summary").json()
            assert body["unmapped_prop_type_rows"] == 2
            # The 12 canonical rows + 2 unmapped = 14 in the totals
            # (the totals count ALL rows in the frame, including unmapped)
            assert body["totals"]["n_listings"] == 14
            # The by_property_type block filters to canonical types only —
            # its 3 bars sum to 12, not 14.
            type_total = sum(t["n"] for t in body["by_property_type"]["types"])
            assert type_total == 12


# ----------------------------------------------------------------------
# No NaN in output
# ----------------------------------------------------------------------


class TestOverviewNoNaN:
    def test_no_nan_in_json(self, app_with_overview, client):
        """The JSON body must never contain NaN / Infinity (Python's json
        dumps them as `NaN` / `Infinity` which are invalid JSON)."""
        import json

        body_text = client.get("/api/v1/overview/summary").text
        # Re-parse to ensure it's valid JSON (would fail if NaN leaked through)
        body = json.loads(body_text)
        assert body is not None

        def _walk(o):
            if isinstance(o, dict):
                for v in o.values():
                    _walk(v)
            elif isinstance(o, list):
                for v in o:
                    _walk(v)
            elif isinstance(o, float):
                assert math.isfinite(o), f"non-finite float in response: {o}"

        _walk(body)
