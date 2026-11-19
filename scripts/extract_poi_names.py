"""One-time extraction: names-enabled POI layer + Kenyan places gazetteer.

Re-runs the equivalent of Notebook 1 Cell 5.2's ogr2ogr command against
``kenya-latest.osm.pbf``, but adds ``name`` to the ``-select`` list so the
POI layer carries the OSM ``name`` tag (Cell 5.2 dropped it — only
``amenity, shop, highway`` were kept).  The output is written **alongside**
the existing ``kenya_pois.gpkg`` as ``kenya_pois_named.gpkg`` — the existing
file is NOT replaced, so B1's already-computed scores stay consistent with
the layer they were built from.

The same ``AMENITY_FILTERS`` from Notebook 1 Cell 5.0 (mirrored here from
the notebook source) are applied so the extracted POIs match the categories
the model scores against.  Where an OSM feature has no ``name`` tag, the
script falls back to ``"<category> near <nearest named town>"`` rather than
leaving the name blank — the nearest town is looked up from the places
gazetteer extracted in the same run.

The places gazetteer (``kenya_places.gpkg``) is extracted from the PBF's
``places`` layer (OSM ``place`` tag: city, town, village, suburb,
neighbourhood, quarter, hamlet).  Each place carries its name, place type,
coordinates, and a derived region subtitle (county + a Nairobi-Metro prefix
where applicable).

Usage::

    python scripts/extract_poi_names.py \\
        --pbf /path/to/kenya-latest.osm.pbf \\
        --out-dir ./artifacts

Prerequisites:
    - GDAL installed (``ogr2ogr`` on PATH; ``apt install gdal-bin`` on Debian)
    - geopandas, shapely, scikit-learn (already in requirements.txt)
    - The PBF downloaded from Geofabrik (~700 MB):
      https://download.geofabrik.de/africa/kenya-latest.osm.pbf

Limitations (report, not silently present as authoritative):
    - **Coverage gaps in the gazetteer**: OSM's ``place`` tag coverage in
      Kenya is uneven — informal settlement names (e.g. "Mukuru kwa Reuben"),
      newly-developed suburbs, and estate names inside large cities are
      under-represented or missing entirely.  The gazetteer is NOT a
      curated administrative dataset; it's whatever the OSM community
      tagged.
    - **POI name fallback is approximate**: "<category> near <town>" is a
      label, not a name — the nearest town may be several km away and the
      POI may be more naturally associated with a different locality.
    - **No deduplication of POIs**: OSM can have duplicate features (the
      same hospital mapped as both a point and a polygon); the script
      converts polygons to centroids and concatenates, so duplicates may
      appear.  The BallTree query in the backend returns the nearest, so
      duplicates don't affect distance correctness but may appear as
      near-identical entries in the named-POI list.
    - **The extraction has NOT been run** in this environment (no PBF
      available, ~700 MB download).  The backend loads whatever
      ``kenya_pois_named.gpkg`` / ``kenya_places.gpkg`` are present; when
      absent, the endpoints return 503 ``DATA_UNAVAILABLE`` and the predict
      diagnostics omit the named-POI block.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

# Ensure src/ is importable for landval.features.geo
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

# Notebook 1 Cell 5.0 — AMENITY_FILTERS (copied verbatim, not imported from
# the notebook, to keep this script standalone).  These MUST match the
# scoring_params.json:amenity_filters the backend loads, so the named-POI
# layer's categories stay consistent with the model's scores.
AMENITY_FILTERS: dict[str, dict[str, list[str]]] = {
    "hospital": {"amenity": ["hospital", "clinic", "dispensary", "health_centre", "health_center"]},
    "school": {"amenity": ["school", "university", "college", "kindergarten"]},
    "market": {"amenity": ["marketplace"], "shop": ["supermarket", "mall", "convenience"]},
    "bank": {"amenity": ["bank", "atm", "microfinance"]},
    "police": {"amenity": ["police"]},
    "bus_stop": {"highway": ["bus_stop"], "amenity": ["bus_station"]},
    "fuel": {"amenity": ["fuel"]},
}

# OSM place tag values to include in the gazetteer (descending importance).
# Source: https://wiki.openstreetmap.org/wiki/Key:place
PLACE_TYPES = [
    "city",
    "town",
    "village",
    "suburb",
    "neighbourhood",
    "quarter",
    "hamlet",
]

# Nairobi Metro counties — used to prefix the region subtitle for places
# inside the metro area (matches Notebook 1's nairobi_adjacent_counties).
NAIROBI_METRO_COUNTIES = {
    "Nairobi",
    "Kiambu",
    "Kajiado",
    "Machakos",
    "Murang'a",
}


# ------------------------------------------------------------------ POI layer


import re

_HSTORE_TAG_RE = re.compile(r'"(?P<key>(?:[^"\\]|\\.)*)"=>"(?P<val>(?:[^"\\]|\\.)*)"')


def _hstore_get(other_tags, key: str) -> str | None:
    """Pull one tag's value out of an OSM hstore-formatted other_tags string
    (e.g. '"amenity"=>"hospital","name"=>"Example"'). Returns None if the
    key isn't present or other_tags is null/not a string."""
    if not other_tags or not isinstance(other_tags, str):
        return None
    for m in _HSTORE_TAG_RE.finditer(other_tags):
        if m.group("key") == key:
            return m.group("val").replace('\\"', '"').replace("\\\\", "\\")
    return None


def extract_pois_named(pbf_path: str, out_path: str) -> int:
    """Run ogr2ogr with ``name`` added to Cell 5.2's -select list.

    Returns the number of POIs written.  Raises CalledProcessError if
    ogr2ogr fails (e.g. GDAL not installed, PBF corrupt).
    """
    temp_out = out_path + ".tmp.gpkg"

    # Cell 5.2 — points layer: amenity OR shop OR highway=bus_stop
    # CHANGE: -select adds "name" (Cell 5.2 had only "amenity,shop,highway")
    # NOTE: "amenity"/"shop" are not in every GDAL install's default OSM
    # points attribute list (it falls back to a minimal built-in set —
    # name/highway/place/etc. — when it can't find a full osmconf.ini), and
    # not every GDAL build exposes the fetch_hstore_value()/hstore_get_value()
    # SQL helper either. So: filter with a plain LIKE on the raw other_tags
    # string (universally supported) and parse the tag values out in Python
    # afterward (see _hstore_get below) instead of relying on either.
    subprocess.run(
        [
            "ogr2ogr",
            "-f",
            "GPKG",
            temp_out,
            pbf_path,
            "points",
            "-where",
            "other_tags LIKE '%\"amenity\"=>%' OR other_tags LIKE '%\"shop\"=>%' "
            "OR highway = 'bus_stop'",
            "-select",
            "name,highway,other_tags",
            "-lco",
            "SPATIAL_INDEX=YES",
            "-overwrite",
        ],
        check=True,
    )

    # Cell 5.2 — multipolygons layer: amenity OR shop (no highway for polys)
    # CHANGE: -select adds "name"
    # NOTE: this GDAL build rejects -append combined with -select/-where
    # ("use -fieldmap or -sql instead") — fold both into a single -sql
    # statement instead, which is explicitly supported alongside -append.
    subprocess.run(
        [
            "ogr2ogr",
            "-f",
            "GPKG",
            "-append",
            temp_out,
            pbf_path,
            "-sql",
            "SELECT name, other_tags FROM multipolygons "
            "WHERE other_tags LIKE '%\"amenity\"=>%' OR other_tags LIKE '%\"shop\"=>%'",
            "-nln",
            "multipolygons",
        ],
        check=True,
    )

    import geopandas as gpd
    import pandas as pd

    pts = gpd.read_file(temp_out, layer="points")
    poly = gpd.read_file(temp_out, layer="multipolygons")
    print(f"  points: {len(pts):,} | polygons: {len(poly):,}")

    # Extract amenity/shop out of the raw other_tags hstore string (format:
    # '"key1"=>"value1","key2"=>"value2"'), rather than relying on any
    # ogr2ogr SQL function support that may not be present in this build.
    for frame in (pts, poly):
        if "other_tags" in frame.columns:
            frame["amenity"] = frame["other_tags"].apply(lambda v: _hstore_get(v, "amenity"))
            frame["shop"] = frame["other_tags"].apply(lambda v: _hstore_get(v, "shop"))
            frame.drop(columns=["other_tags"], inplace=True)
        else:
            frame["amenity"] = None
            frame["shop"] = None

    # Cell 5.2 — polygons to centroids, concat, drop null geometries
    poly["geometry"] = poly.geometry.centroid
    pois = pd.concat([pts, poly], ignore_index=True)
    del pts, poly

    # Cell 5.2 — drop null geometries + rows with no amenity/shop/highway tag
    pois = (
        pois[pois.geometry.notnull()]
        .to_crs("EPSG:4326")
        .dropna(subset=["amenity", "shop", "highway"], how="all")
        .reset_index(drop=True)
    )

    # Ensure the name column exists even if no feature had one
    if "name" not in pois.columns:
        pois["name"] = None

    pois.to_file(out_path, driver="GPKG")
    os.remove(temp_out)
    return len(pois)


# ------------------------------------------------------------------ POI names


def assign_poi_category(row) -> str | None:
    """Map a POI's amenity/shop/highway tags to one of the AMENITY_FILTERS
    categories, or None if it doesn't match any."""
    amenity = row.get("amenity")
    shop = row.get("shop")
    highway = row.get("highway")
    for cat, filters in AMENITY_FILTERS.items():
        if "amenity" in filters and amenity in filters["amenity"]:
            return cat
        if "shop" in filters and shop in filters["shop"]:
            return cat
        if "highway" in filters and highway in filters["highway"]:
            return cat
    return None


def fill_unnamed_pois(pois_path: str, places_path: str) -> int:
    """For POIs with no name, set name = '<category> near <nearest town>'.

    Loads the places gazetteer (from the same run), builds a BallTree, and
    for each unnamed POI finds the nearest named place.  Returns the number
    of POIs whose name was filled by the fallback.
    """
    import geopandas as gpd
    import numpy as np
    from sklearn.neighbors import BallTree

    pois = gpd.read_file(pois_path)
    if "name" not in pois.columns:
        pois["name"] = None

    # Assign categories
    pois["_category"] = pois.apply(assign_poi_category, axis=1)

    unnamed = pois["name"].isna() | (pois["name"] == "")
    n_unnamed = int(unnamed.sum())
    if n_unnamed == 0:
        # Nothing to fill — drop the helper column and save
        pois = pois.drop(columns=["_category"])
        pois.to_file(pois_path, driver="GPKG")
        return 0

    # Load places gazetteer for nearest-town lookup
    if not os.path.exists(places_path):
        print(
            f"  WARNING: places gazetteer not found at {places_path}; "
            f"leaving {n_unnamed} POIs with blank names"
        )
        pois = pois.drop(columns=["_category"])
        pois.to_file(pois_path, driver="GPKG")
        return 0

    places = gpd.read_file(places_path)
    places = places[places.geometry.notna()].reset_index(drop=True)
    if len(places) == 0:
        pois = pois.drop(columns=["_category"])
        pois.to_file(pois_path, driver="GPKG")
        return 0

    # Build a BallTree over the places (haversine, radians)
    place_coords = np.radians(np.array([[g.y, g.x] for g in places.geometry if g is not None]))
    tree = BallTree(place_coords, metric="haversine")

    # Query the nearest place for each unnamed POI
    unnamed_pois = pois[unnamed].copy()
    unnamed_coords = np.radians(np.array([[g.y, g.x] for g in unnamed_pois.geometry]))
    _, idx = tree.query(unnamed_coords, k=1)
    nearest_town_names = places.iloc[idx.flatten()]["name"].values

    # Fill: "<category> near <town>"
    fallback_names = []
    for cat, town in zip(unnamed_pois["_category"].values, nearest_town_names, strict=False):
        cat_label = cat if cat is not None else "poi"
        fallback_names.append(f"{cat_label} near {town}")

    pois.loc[unnamed, "name"] = fallback_names
    pois = pois.drop(columns=["_category"])
    pois.to_file(pois_path, driver="GPKG")
    return n_unnamed


# ------------------------------------------------------------------ Places gazetteer


def extract_places_gazetteer(pbf_path: str, out_path: str) -> int:
    """Extract the OSM places layer (towns, villages, suburbs, etc.) to a GPKG.

    Each place carries: name, place_type, county (derived from the point's
    location — here we use a simple lat/lon bounding-box heuristic for the
    Nairobi metro area; a production version would point-in-polygon against
    the counties GPKG), latitude, longitude, and a region subtitle.

    Returns the number of places written.
    """
    import geopandas as gpd

    # Extract the places layer from the PBF — OSM tags every named settlement
    # with a `place` tag (city, town, village, suburb, neighbourhood, etc.)
    temp_out = out_path + ".tmp.gpkg"
    where_clause = "place IN ('" + "','".join(PLACE_TYPES) + "')"
    subprocess.run(
        [
            "ogr2ogr",
            "-f",
            "GPKG",
            temp_out,
            pbf_path,
            "points",
            "-where",
            where_clause,
            "-select",
            "name,place",
            "-lco",
            "SPATIAL_INDEX=YES",
            "-overwrite",
        ],
        check=True,
    )

    places = gpd.read_file(temp_out)
    if len(places) == 0:
        print("  WARNING: no places found in PBF — gazetteer is empty")
        places.to_file(out_path, driver="GPKG")
        os.remove(temp_out)
        return 0

    # Rename OSM columns to our schema
    places = places.rename(columns={"place": "place_type"})
    if "population" not in places.columns:
        places["population"] = None

    # Derive a region subtitle.  Without a counties polygon file at this
    # stage, we use a coarse bounding-box heuristic for the Nairobi metro
    # area; the backend's counties GPKG (loaded separately) can refine this
    # later via point-in-polygon.  This is an APPROXIMATION — report it.
    lat = places.geometry.y
    lon = places.geometry.x
    # Nairobi metro bbox (approximate): lat -1.5 to -0.7, lon 36.6 to 37.2
    in_metro = (lat > -1.5) & (lat < -0.7) & (lon > 36.6) & (lon < 37.2)
    # The county assignment here is a placeholder — the real county lookup
    # happens in the backend via the counties GPKG.  We set it to None so
    # the backend fills it in via point-in-polygon at load time.
    places["county"] = None
    places["subtitle"] = ["Nairobi Metropolitan" if m else "Kenya" for m in in_metro]
    # Enrich subtitle with place type
    places["subtitle"] = places["subtitle"] + " — " + places["place_type"].fillna("place")

    places = places[places.geometry.notna()].reset_index(drop=True)
    places.to_file(out_path, driver="GPKG")
    os.remove(temp_out)
    return len(places)


# ------------------------------------------------------------------ main


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract names-enabled POIs + places gazetteer from kenya-latest.osm.pbf"
    )
    parser.add_argument("--pbf", required=True, help="Path to kenya-latest.osm.pbf")
    parser.add_argument(
        "--out-dir",
        default="./artifacts",
        help="Output directory (default: ./artifacts)",
    )
    parser.add_argument(
        "--skip-pois",
        action="store_true",
        help="Skip the POI extraction (only extract the places gazetteer)",
    )
    parser.add_argument(
        "--skip-places",
        action="store_true",
        help="Skip the places gazetteer extraction",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pois_path = str(out_dir / "kenya_pois_named.gpkg")
    places_path = str(out_dir / "kenya_places.gpkg")

    if not args.skip_places:
        print("=" * 60)
        print("Extracting places gazetteer (kenya_places.gpkg)...")
        t0 = time.perf_counter()
        n_places = extract_places_gazetteer(args.pbf, places_path)
        t_places = time.perf_counter() - t0
        print(f"  {n_places:,} places written to {places_path} ({t_places:.1f}s)")
        print(f"  size: {os.path.getsize(places_path) / 1e6:.1f} MB")
    else:
        print("Skipping places gazetteer (--skip-places)")

    if not args.skip_pois:
        print()
        print("=" * 60)
        print("Extracting names-enabled POIs (kenya_pois_named.gpkg)...")
        t0 = time.perf_counter()
        n_pois = extract_pois_named(args.pbf, pois_path)
        t_pois = time.perf_counter() - t0
        print(f"  {n_pois:,} POIs written to {pois_path} ({t_pois:.1f}s)")
        print(f"  size: {os.path.getsize(pois_path) / 1e6:.1f} MB")

        # Fill unnamed POIs with the "<category> near <town>" fallback
        if os.path.exists(places_path):
            print()
            print("Filling unnamed POIs with '<category> near <nearest town>'...")
            t0 = time.perf_counter()
            n_filled = fill_unnamed_pois(pois_path, places_path)
            t_fill = time.perf_counter() - t0
            print(f"  {n_filled:,} POIs filled with fallback names ({t_fill:.1f}s)")
        else:
            print("  WARNING: places gazetteer not found — skipping name fallback")
    else:
        print("Skipping POI extraction (--skip-pois)")

    # Write a small manifest the backend can read to report row counts
    manifest_path = out_dir / "extraction_manifest.json"
    manifest: dict = {"created": time.strftime("%Y-%m-%d %H:%M:%S"), "pbf": args.pbf}
    if os.path.exists(pois_path):
        manifest["kenya_pois_named.gpkg"] = {
            "bytes": os.path.getsize(pois_path),
            "rows": n_pois if not args.skip_pois else None,
        }
    if os.path.exists(places_path):
        manifest["kenya_places.gpkg"] = {
            "bytes": os.path.getsize(places_path),
            "rows": n_places if not args.skip_places else None,
        }
    manifest["amenity_filters"] = AMENITY_FILTERS
    manifest["place_types"] = PLACE_TYPES
    manifest["limitations"] = [
        "OSM place tag coverage in Kenya is uneven — informal settlement names, "
        "newly-developed suburbs, and estate names inside large cities are "
        "under-represented or missing.",
        "POI name fallback '<category> near <town>' is a label, not a name — "
        "the nearest town may be several km away.",
        "No deduplication of POIs — OSM can have duplicate point+polygon features.",
        "County assignment is a placeholder (None) — the backend fills it in via "
        "point-in-polygon against the counties GPKG at load time.",
    ]
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print()
    print(f"Extraction manifest written to {manifest_path}")


if __name__ == "__main__":
    main()
