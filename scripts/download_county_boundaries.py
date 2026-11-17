"""One-time download + simplification of Kenya county boundaries.

Downloads the GADM Level 1 county boundaries GPKG (the same file Notebook 1
Cell 4.9 downloads for point-in-polygon county assignment), extracts the
ADM1 (county) layer, simplifies the geometries via Douglas-Peucker to keep
the GeoJSON light for choropleth rendering on every Market Insights page
load, and writes the result to ``ARTIFACTS_DIR/kenya_counties_simplified.geojson``.

Source: https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/gadm41_KEN.gpkg
(Cell 4.9 of 01_data_preparation_and_feature_engineering.ipynb)

The simplified GeoJSON is NOT the same file as ``kenya_counties.gpkg``
(B1's full-resolution county lookup file) — it is a sibling artifact
for rendering only.  B1's county lookup keeps using the full-resolution
GPKG so point-in-polygon accuracy is unaffected.

Usage::

    python scripts/download_county_boundaries.py --out-dir ./artifacts

Prerequisites:
    - GDAL installed (``ogr2ogr`` on PATH; ``apt install gdal-bin`` on Debian)
      OR geopandas + shapely (already in requirements.txt) for the
      in-process simplification path
    - Network access to geodata.ucdavis.edu

The script downloads the GPKG (~15 MB) once and caches it; subsequent
runs skip the download and only re-simplify if the tolerance changes.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Ensure src/ is importable for landval.features.geo
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

# Cell 4.9 — the exact URL the notebook downloads from.
GADM_URL = "https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/gadm41_KEN.gpkg"
GADM_FILENAME = "gadm41_KEN.gpkg"

# Douglas-Peucker simplification tolerance in degrees (EPSG:4326).
# 0.005° ≈ 550 m at the equator — fine enough to preserve county outlines
# recognisably, coarse enough to shrink the GeoJSON from ~5 MB to ~500 KB.
# Rendered on every Market Insights page load, so the trade-off favours
# smaller file size over cartographic precision.
SIMPLIFY_TOLERANCE_DEG = 0.005


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download + simplify Kenya county boundaries for the Market Insights choropleth"
    )
    parser.add_argument(
        "--out-dir",
        default="./artifacts",
        help="Output directory (default: ./artifacts)",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=SIMPLIFY_TOLERANCE_DEG,
        help=(
            f"Douglas-Peucker simplification tolerance in degrees "
            f"(default {SIMPLIFY_TOLERANCE_DEG}° ≈ 550 m; smaller = more detail + larger file)"
        ),
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip the GADM download (use an existing gadm41_KEN.gpkg in --out-dir)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    gpkg_path = out_dir / GADM_FILENAME
    geojson_path = out_dir / "kenya_counties_simplified.geojson"

    # ---- 1. Download the GADM GPKG (Cell 4.9's exact command) ----
    if not args.skip_download and not gpkg_path.exists():
        print(f"Downloading GADM Kenya county boundaries from {GADM_URL}...")
        t0 = time.perf_counter()
        ret = os.system(f'wget -q --show-progress "{GADM_URL}" -O "{gpkg_path}"')
        if ret != 0 or not gpkg_path.exists():
            print(f"ERROR: download failed (wget exit code {ret})")
            sys.exit(1)
        t_dl = time.perf_counter() - t0
        print(f"  downloaded {os.path.getsize(gpkg_path) / 1e6:.1f} MB in {t_dl:.1f}s")
    elif gpkg_path.exists():
        print(f"GADM GPKG already present: {gpkg_path} ({os.path.getsize(gpkg_path) / 1e6:.1f} MB)")
    else:
        print(f"ERROR: --skip-download set but {gpkg_path} not found")
        sys.exit(1)

    # ---- 2. Load + simplify + write GeoJSON ----
    print()
    print(f"Loading GADM GPKG + simplifying (tolerance={args.tolerance}°)...")
    import fiona
    import geopandas as gpd

    layers = fiona.listlayers(str(gpkg_path))
    print(f"  available layers: {layers}")

    # GADM4.1 ships multiple ADM levels; ADM1 = counties (47 in Kenya)
    # The layer name is typically "ADM_ADM_1" but varies by GADM version.
    adm1_layer = None
    for candidate in ("ADM_ADM_1", "adm1", "level1"):
        if candidate in layers:
            adm1_layer = candidate
            break
    if adm1_layer is None:
        # Fall back: pick the layer whose feature count is ~47 (Kenya counties)
        best = None
        for layer in layers:
            try:
                n = len(gpd.read_file(str(gpkg_path), layer=layer))
                if 40 <= n <= 60:
                    best = layer
                    break
            except Exception:
                continue
        if best is None:
            print(f"ERROR: could not find the ADM1 (county) layer in {gpkg_path}")
            print(f"  available layers: {layers}")
            sys.exit(1)
        adm1_layer = best
        print(f"  (heuristic pick: layer '{adm1_layer}' has ~47 features)")

    gdf = gpd.read_file(str(gpkg_path), layer=adm1_layer)
    print(f"  loaded {len(gdf)} features from layer '{adm1_layer}'")

    # GADM column names: NAME_1 = county name, GID_1 = unique ID, TYPE_1 = admin type
    name_col = "NAME_1" if "NAME_1" in gdf.columns else gdf.columns[0]
    print(f"  county name column: '{name_col}'")

    # Keep only the columns the choropleth needs + simplify the geometry
    keep_cols = [c for c in ("GID_1", name_col, "TYPE_1", "ENGTYPE_1") if c in gdf.columns]
    gdf = gdf[keep_cols + ["geometry"]].copy()
    gdf = gdf.rename(columns={name_col: "county"})

    # Simplify — Douglas-Peucker, preserve_topology=True for safety
    t0 = time.perf_counter()
    gdf["geometry"] = gdf["geometry"].simplify(args.tolerance, preserve_topology=True)
    t_simplify = time.perf_counter() - t0
    print(f"  simplified in {t_simplify:.2f}s")

    # Write GeoJSON (EPSG:4326, which is what leaflet/mapbox expects)
    t0 = time.perf_counter()
    gdf.to_file(str(geojson_path), driver="GeoJSON")
    t_write = time.perf_counter() - t0
    geojson_size_mb = os.path.getsize(geojson_path) / 1e6
    print(f"  wrote {geojson_path} ({geojson_size_mb:.2f} MB, {t_write:.2f}s)")
    print(
        f"  {len(gdf)} counties, tolerance {args.tolerance}° ≈ {args.tolerance * 111:.0f} km at equator"
    )

    # ---- 3. Write a small manifest the backend can report ----
    manifest = {
        "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        "source": GADM_URL,
        "source_note": "GADM Level 1 (county) boundaries — the same file Notebook 1 Cell 4.9 downloads for point-in-polygon county assignment",
        "gpkg_bytes": os.path.getsize(gpkg_path),
        "simplified_geojson_bytes": os.path.getsize(geojson_path),
        "simplified_geojson_mb": round(geojson_size_mb, 3),
        "n_counties": len(gdf),
        "simplify_tolerance_deg": args.tolerance,
        "simplify_tolerance_km_equator": round(args.tolerance * 111, 1),
        "simplify_method": "Douglas-Peucker (shapely.simplify, preserve_topology=True)",
        "crs": "EPSG:4326",
        "county_name_column": "county (renamed from GADM NAME_1)",
        "limitation": (
            "Simplified for rendering — NOT for point-in-polygon. B1's "
            "county lookup (kenya_counties.gpkg) uses the full-resolution "
            "GPKG; this simplified GeoJSON is for the choropleth only."
        ),
    }
    manifest_path = out_dir / "county_boundaries_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest written to {manifest_path}")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
