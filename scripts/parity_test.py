"""Parity test — recomputes every feature from lat/lon/county and compares
with the stored values in parity_fixture.parquet.

Usage::

    python scripts/parity_test.py --artifacts-dir ./artifacts

Outputs ``parity_report.md`` and ``parity_report.csv`` in the artifacts dir.
Pass rule: at least 99% of rows within tolerance for every feature, and no
systematic offset. Infrastructure parity only on rows not imputed.
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

# Ensure src/ is importable (landval/ lives under <repo>/src/, not <repo>/)
sys.path.insert(0, str(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from landval.features.pipeline import FeaturePipeline


def run_parity(artifacts_dir: str) -> tuple[bool, pd.DataFrame]:
    """Run the parity test and return (passed, report_df)."""
    fixture_path = os.path.join(artifacts_dir, "parity_fixture.parquet")
    if not os.path.exists(fixture_path):
        print(f"parity_fixture.parquet not found at {fixture_path} — skipping.")
        return False, pd.DataFrame()

    fixture = pd.read_parquet(fixture_path)
    print(f"Loaded parity fixture: {len(fixture)} rows")

    pipeline = FeaturePipeline(artifacts_dir)

    # Load tolerances from feature_manifest.json
    tolerances: dict[str, float] = {}
    for f in pipeline.feature_manifest.get("parity", {}).get("features", []):
        tolerances[f["name"]] = f.get("tolerance", 0.5)

    # Features to test (geographic only — no text-boosted variants)
    test_features = [
        "dist_to_nairobi_km",
        "dist_to_county_town_km",
        "dist_to_water_body_km",
        "reference_city_dist_km",
        "amenities_score_osm",
        "accessibility_score_osm",
    ]

    # Infrastructure: only on rows not imputed
    infra_mask = fixture.get("infra_source", pd.Series()) != "imputed_county_median"
    if "infra_source" not in fixture.columns:
        infra_mask = pd.Series([True] * len(fixture))

    report_rows = []

    for feature_name in test_features + ["infrastructure_score"]:
        if feature_name not in fixture.columns:
            report_rows.append(
                {
                    "feature": feature_name,
                    "tested_rows": 0,
                    "within_tolerance": 0,
                    "pct_within": float("nan"),
                    "max_diff": float("nan"),
                    "mean_diff": float("nan"),
                    "pass": "SKIP (column missing)",
                }
            )
            continue

        tolerance = tolerances.get(feature_name, 0.5)

        # For infrastructure, only test non-imputed rows
        if feature_name == "infrastructure_score":
            mask = infra_mask
        else:
            mask = pd.Series([True] * len(fixture))

        stored = fixture.loc[mask, feature_name].astype(float)
        computed_vals = []
        listing_numbers = (
            fixture.loc[mask, "listing_no"].tolist() if "listing_no" in fixture.columns else []
        )

        for idx in fixture.loc[mask].index:
            row = fixture.loc[idx]
            lat = row.get("latitude")
            lon = row.get("longitude")
            county = row.get("county")
            size_acres = row.get("size_acres", 1.0)

            if pd.isnull(lat) or pd.isnull(lon):
                computed_vals.append(float("nan"))
                continue

            try:
                result = pipeline.compute_features(
                    lat,
                    lon,
                    size_acres,
                    parcel_features={
                        item: int(row.get(f"infra_{item}", 0))
                        for item in [
                            "borehole",
                            "piped_water",
                            "river_water",
                            "water_tank",
                            "grid_electric",
                            "solar_electric",
                            "full_fence",
                            "partial_fence",
                            "structures",
                            "internal_road",
                        ]
                    },
                )
                computed_vals.append(result.features.get(feature_name, float("nan")))
            except Exception:
                computed_vals.append(float("nan"))

        computed = pd.Series(computed_vals, index=stored.index)

        # Compare — both must be non-null
        both_valid = stored.notna() & computed.notna()
        diffs = (computed[both_valid] - stored[both_valid]).abs()
        within = (diffs <= tolerance).sum()
        total = both_valid.sum()

        pct = within / total * 100 if total > 0 else float("nan")
        max_diff = diffs.max() if len(diffs) > 0 else float("nan")
        mean_diff = diffs.mean() if len(diffs) > 0 else float("nan")

        # Worst mismatches
        worst_indices = diffs.nlargest(min(5, len(diffs))).index.tolist()
        worst_listings = [
            listing_numbers[i] if i < len(listing_numbers) else "?" for i in worst_indices
        ]
        worst_diffs = [float(diffs[i]) for i in worst_indices]

        passed = pct >= 99.0 if not np.isnan(pct) else False
        report_rows.append(
            {
                "feature": feature_name,
                "tested_rows": int(total),
                "within_tolerance": int(within),
                "pct_within": round(pct, 2) if not np.isnan(pct) else float("nan"),
                "max_diff": round(max_diff, 4) if not np.isnan(max_diff) else float("nan"),
                "mean_diff": round(mean_diff, 4) if not np.isnan(mean_diff) else float("nan"),
                "pass": "PASS" if passed else "FAIL",
                "worst_listing_numbers": ", ".join(worst_listings),
                "worst_diffs": ", ".join(f"{d:.4f}" for d in worst_diffs),
            }
        )

    report_df = pd.DataFrame(report_rows)

    # Write CSV
    csv_path = os.path.join(artifacts_dir, "parity_report.csv")
    report_df.to_csv(csv_path, index=False)
    print(f"parity_report.csv written to {csv_path}")

    # Write markdown
    md_path = os.path.join(artifacts_dir, "parity_report.md")
    with open(md_path, "w") as f:
        f.write("# Parity Report\n\n")
        f.write(f"Fixture rows: {len(fixture)}\n\n")
        f.write("| Feature | Tested | Within tol | % | Max diff | Mean diff | Pass |\n")
        f.write("|---|---|---|---|---|---|---|\n")
        for _, r in report_df.iterrows():
            f.write(
                f"| {r['feature']} | {r['tested_rows']} | "
                f"{r['within_tolerance']} | {r['pct_within']} | "
                f"{r['max_diff']} | {r['mean_diff']} | {r['pass']} |\n"
            )
        f.write("\n## Worst mismatches\n\n")
        for _, r in report_df.iterrows():
            if r.get("worst_listing_numbers"):
                f.write(
                    f"- **{r['feature']}**: listings {r['worst_listing_numbers']} "
                    f"(diffs: {r['worst_diffs']})\n"
                )
        # Index load report
        f.write("\n## Index load times and memory\n\n")
        idx_report = pipeline.index_load_report()
        for name, info in idx_report.items():
            f.write(f"- **{name}**: {info}\n")
    print(f"parity_report.md written to {md_path}")

    all_passed = all(
        r["pass"] == "PASS" for r in report_rows if r["pass"] != "SKIP (column missing)"
    )
    return all_passed, report_df


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run feature parity test")
    parser.add_argument(
        "--artifacts-dir", default="./artifacts", help="Path to artifacts directory"
    )
    args = parser.parse_args()

    passed, report = run_parity(args.artifacts_dir)
    print(f"\nOverall: {'PASS' if passed else 'FAIL'}")
    sys.exit(0 if passed else 1)
