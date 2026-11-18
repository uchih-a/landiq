"""Tests for the P4b Deal Finder backend: /listings/scored order + exact
matching, /listings/options, /listings/{no}/nearby, and the CSV export.

Hand-checkable fixtures; reuses the tiny exports helpers.
"""

from __future__ import annotations

import pandas as pd
import pytest

from tests.test_app_exports import _tiny_manifest, _write_app_exports


def _df_frame() -> pd.DataFrame:
    """12 rows across 3 pages of 5, sorted cheapest-first in the frame
    itself (so a head()-based bug would be visible).

    Nairobi rows have coordinates near the reference; Kiambu rows are
    ~30 km away; Nakuru ~140 km.
    """
    rows = []
    counties = [
        ("Nairobi", -1.29, 36.82),
        ("Kiambu", -1.04, 36.83),
        ("Nakuru", -0.30, 36.07),
    ]
    types = ["Land", "Farm", "Commercial"]
    # 12 rows: ratios 0.5 .. 1.6 ascending (cheapest first in the frame).
    for i in range(12):
        county, lat, lon = counties[i % 3]
        price = float((12 - i) * 1_000_000)
        pred = 8_000_000.0
        rows.append(
            {
                "listing_no": f"L{i + 1:03d}",
                "listing_url": None,
                "title": f"Row {i + 1}",
                "location": None,
                "county": county,
                "prop_type": types[i % 3],
                "latitude": lat,
                "longitude": lon,
                "price_ksh": price * 2,
                "size_acres": float((i % 4) + 1),
                "listed_price_per_acre_ksh": price,
                "predicted_price_per_acre_ksh": pred,
                "low_price_per_acre_ksh": pred * 0.6,
                "high_price_per_acre_ksh": pred * 1.5,
                "listed_over_predicted": price / pred,
                "scored_by": "oof",
                # Verdict consistent with the interval columns below
                # (listed < low -> underpriced; listed > high -> overpriced;
                # else fair) so the options rule reproduces it exactly.
                "verdict": (
                    "underpriced"
                    if price < pred * 0.6
                    else ("overpriced" if price > pred * 1.5 else "fair")
                ),
                "data_quality_flag": i == 11,
            }
        )
    return pd.DataFrame(rows)


def _df_exports() -> dict:
    return {
        "manifest.json": _tiny_manifest(),
        "listings_scored.parquet": _df_frame(),
    }


@pytest.fixture
def df_app(app, tmp_path):
    _write_app_exports(tmp_path, _df_exports())
    from app.services.app_exports import AppExportsRegistry

    app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
    yield app


class TestSortOrder:
    def test_asc_across_pages_globally_consistent(self, df_app, client):
        """Page 2 asc starts AFTER page 1 asc ends (globally sorted)."""
        p1 = client.get(
            "/api/v1/listings/scored?page=1&page_size=5&sort=listed_over_predicted&order=asc"
        ).json()
        p2 = client.get(
            "/api/v1/listings/scored?page=2&page_size=5&sort=listed_over_predicted&order=asc"
        ).json()
        assert (
            p1["listings"][-1]["listed_over_predicted"]
            <= p2["listings"][0]["listed_over_predicted"]
        )
        # Asc order = cheapest first.
        ratios = [r["listed_over_predicted"] for r in p1["listings"]]
        assert ratios == sorted(ratios)

    def test_desc_is_exact_reverse_of_asc(self, df_app, client):
        asc = []
        for page in (1, 2, 3):
            asc += client.get(
                f"/api/v1/listings/scored?page={page}&page_size=5&sort=listed_over_predicted&order=asc"
            ).json()["listings"]
        desc = []
        for page in (1, 2, 3):
            desc += client.get(
                f"/api/v1/listings/scored?page={page}&page_size=5&sort=listed_over_predicted&order=desc"
            ).json()["listings"]
        assert [r["listing_no"] for r in desc] == [r["listing_no"] for r in asc][::-1]

    def test_default_order_is_asc_for_ratio(self, df_app, client):
        """No order param -> asc (the historical default)."""
        body = client.get("/api/v1/listings/scored?sort=listed_over_predicted").json()
        ratios = [r["listed_over_predicted"] for r in body["listings"]]
        assert ratios == sorted(ratios)

    def test_invalid_order_422_with_allowed(self, df_app, client):
        resp = client.get("/api/v1/listings/scored?order=up")
        assert resp.status_code == 422
        assert resp.json()["error"]["details"]["allowed"] == ["asc", "desc"]

    def test_stable_tiebreak_by_listing_no(self, app, tmp_path):
        """Rows with equal sort keys break ties by listing_no ascending."""
        df = _df_frame()
        # Force equal ratios on all rows.
        df["listed_over_predicted"] = 1.0
        _write_app_exports(
            tmp_path, {"manifest.json": _tiny_manifest(), "listings_scored.parquet": df}
        )
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/listings/scored?sort=listed_over_predicted&order=asc").json()
            nos = [r["listing_no"] for r in body["listings"]]
            assert nos == sorted(nos)


class TestExactMatching:
    def test_prop_type_exact_case_insensitive(self, df_app, client):
        body = client.get("/api/v1/listings/scored?prop_type=land").json()
        assert all(r["prop_type"] == "Land" for r in body["listings"])

    def test_prop_type_substring_now_422(self, df_app, client):
        """P4b: substring matching is gone — 'Lan' (would match Land) 422s."""
        resp = client.get("/api/v1/listings/scored?prop_type=Lan")
        assert resp.status_code == 422
        assert resp.json()["error"]["details"]["allowed"] == ["Land", "Farm", "Commercial"]

    def test_county_exact_case_insensitive(self, df_app, client):
        body = client.get("/api/v1/listings/scored?county=NAIROBI").json()
        assert all(r["county"] == "Nairobi" for r in body["listings"])

    def test_unknown_county_422_with_allowed(self, df_app, client):
        resp = client.get("/api/v1/listings/scored?county=NAIR")
        assert resp.status_code == 422
        assert "Nairobi" in resp.json()["error"]["details"]["allowed"]


class TestListingsOptions:
    def test_options_shape(self, df_app, client):
        resp = client.get("/api/v1/listings/options")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        for key in (
            "property_types",
            "unmapped_prop_type_rows",
            "counties",
            "verdicts",
            "amenities",
            "radii_km",
            "amenity_filter_available",
            "page_sizes",
            "default_page_size",
            "max_page_size",
            "sort_keys",
            "export_max_rows",
        ):
            assert key in body, f"missing: {key}"

    def test_property_types_with_counts(self, df_app, client):
        body = client.get("/api/v1/listings/options").json()
        types = {pt["name"]: pt["n"] for pt in body["property_types"]}
        # 12 rows: 4 each of Land/Farm/Commercial (i % 3 over 12).
        assert types == {"Land": 4, "Farm": 4, "Commercial": 4}
        assert body["unmapped_prop_type_rows"] == 0

    def test_verdict_rules_derived_from_data(self, df_app, client):
        """The verdict rule reproduces the stored verdict via the
        interval comparison on the frame (match_rate 1.0 on the fixture)."""
        body = client.get("/api/v1/listings/options").json()
        under = next(v for v in body["verdicts"] if v["value"] == "underpriced")
        assert under["rule"]["basis"] == "conformal_interval"
        assert under["rule"]["match_rate"] == pytest.approx(1.0)
        # Empirical cut-offs computed from the frame, not typed.
        assert under["rule"]["under_ratio_max"] is not None

    def test_amenity_filter_available_false_without_service(self, df_app, client):
        """The test app has no amenity service -> available=false."""
        body = client.get("/api/v1/listings/options").json()
        assert body["amenity_filter_available"] is False
        assert body["amenities"] == []

    def test_page_sizes_and_sort_keys(self, df_app, client):
        body = client.get("/api/v1/listings/options").json()
        assert body["default_page_size"] == 50
        assert body["max_page_size"] >= max(body["page_sizes"])
        sk = {k["value"]: k["default_order"] for k in body["sort_keys"]}
        assert sk["listed_over_predicted"] == "asc"
        assert sk["size_acres"] == "desc"

    def test_unmapped_prop_types_counted(self, app, tmp_path):
        df = _df_frame()
        df.loc[0, "prop_type"] = "Residential"
        _write_app_exports(
            tmp_path, {"manifest.json": _tiny_manifest(), "listings_scored.parquet": df}
        )
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/listings/options").json()
            assert body["unmapped_prop_type_rows"] == 1

    def test_options_503_when_frame_missing(self, app, client):
        resp = client.get("/api/v1/listings/options")
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "DATA_UNAVAILABLE"


class TestListingNearby:
    def test_nearby_orders_by_distance_excludes_self(self, df_app, client):
        """L001 is a Nairobi row; the nearest others are the other
        Nairobi rows (near-0 km), not Kiambu/Nakuru."""
        body = client.get("/api/v1/listings/L001/nearby?radius_km=50&limit=5").json()
        assert body["listing_no"] == "L001"
        assert body["reason"] is None
        dists = [n["distance_km"] for n in body["nearby"]]
        assert dists == sorted(dists)
        assert all(d > 0 for d in dists)  # self excluded
        # All within 50 km of a Nairobi point -> only Nairobi rows.
        assert all(n["distance_km"] < 50 for n in body["nearby"])

    def test_unknown_listing_404(self, df_app, client):
        resp = client.get("/api/v1/listings/L999/nearby")
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "RESOURCE_NOT_FOUND"

    def test_no_coordinates_returns_empty_with_reason(self, app, tmp_path):
        df = _df_frame()
        df.loc[:, ["latitude", "longitude"]] = None
        _write_app_exports(
            tmp_path, {"manifest.json": _tiny_manifest(), "listings_scored.parquet": df}
        )
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/listings/L001/nearby").json()
            assert body["reason"] == "no_coordinates"
            assert body["nearby"] == []

    def test_limit_respected(self, df_app, client):
        body = client.get("/api/v1/listings/L001/nearby?limit=2").json()
        assert len(body["nearby"]) <= 2

    def test_radius_narrows(self, df_app, client):
        """radius_km=0.001 -> only rows at essentially the same point
        (the 3 Nairobi rows share lat/lon ± 0) -> possibly zero."""
        body = client.get("/api/v1/listings/L001/nearby?radius_km=0.001").json()
        assert all(n["distance_km"] <= 0.001 for n in body["nearby"])


class TestExportCsv:
    def test_export_row_count_equals_total(self, df_app, client):
        resp = client.get("/api/v1/listings/scored/export.csv")
        assert resp.status_code == 200
        text = resp.content.decode("utf-8-sig")
        lines = [ln for ln in text.splitlines() if ln]
        assert lines[0].startswith("listing_no,title,county")
        # 12 rows + 1 header.
        assert len(lines) == 13
        # Total matches the pagination total.
        total = client.get("/api/v1/listings/scored").json()["pagination"]["total_rows"]
        assert len(lines) - 1 == total

    def test_export_respects_filters(self, df_app, client):
        resp = client.get("/api/v1/listings/scored/export.csv?county=Nairobi")
        text = resp.content.decode("utf-8-sig")
        lines = [ln for ln in text.splitlines() if ln]
        # 4 Nairobi rows + header.
        assert len(lines) == 5
        assert all("Nairobi" in ln for ln in lines[1:])

    def test_export_bom_present(self, df_app, client):
        resp = client.get("/api/v1/listings/scored/export.csv")
        assert resp.content.startswith(b"\xef\xbb\xbf")

    def test_export_content_disposition_filename(self, df_app, client):
        resp = client.get("/api/v1/listings/scored/export.csv?county=Nairobi&prop_type=Land")
        assert "nairobi-land" in resp.headers["Content-Disposition"]

    def test_export_422_on_bad_prop_type(self, df_app, client):
        resp = client.get("/api/v1/listings/scored/export.csv?prop_type=Residential")
        assert resp.status_code == 422

    def test_export_truncation_headers_when_capped(self, app, tmp_path):
        """With LISTINGS_EXPORT_MAX_ROWS=5, the export carries truncation
        headers and only 5 rows."""
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        _write_app_exports(tmp_path, _df_exports())
        with TestClient(app) as client:
            # The lifespan re-loads app_exports from the conftest's
            # ARTIFACTS_DIR (the same tmp_path we wrote to) — re-point it
            # at our frame, then set the cap (settings exists post-lifespan).
            app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
            app.state.settings.listings_export_max_rows = 5
            resp = client.get("/api/v1/listings/scored/export.csv")
            assert resp.headers.get("X-Export-Truncated") == "true"
            assert resp.headers.get("X-Export-Total") == "12"
            text = resp.content.decode("utf-8-sig")
            assert len([ln for ln in text.splitlines() if ln]) == 6  # 5 + header
            app.state.settings.listings_export_max_rows = None

    def test_no_nan_in_export(self, df_app, client):
        """Money columns are raw numbers; no NaN/inf strings appear."""
        resp = client.get("/api/v1/listings/scored/export.csv")
        text = resp.content.decode("utf-8-sig")
        assert "nan" not in text.lower().replace("nairobi", "")
        assert "inf" not in text.lower()
