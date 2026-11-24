"""Part 3 — drop-in replacement cells for Notebook 1
(``01_data_preparation_and_feature_engineering.ipynb``).

Paste each labelled block into the matching cell, then rerun Notebooks
1 -> 3.  Every cell IMPORTS from ``landval.cleaning`` (the new modules in
``src/landval/cleaning/``) — no logic is inlined, so the notebook and the
backend tests share one implementation.

Cells replaced
--------------
  Cell 45  — size constants + import   (was: clean_size def)
  Cell 47  — apply clean_sizes          (was: df["size"].apply(clean_size))
  Cell 49  — description fallback       (now integrated into clean_sizes;
             this cell is a thin verification/reporting cell)
  Cell 167 — price_per_acre             (was: price_ksh / size_acres)
  Cell 169 — FINAL_COLUMNS additions    (add the new columns)

The originals are preserved verbatim in
``backend/tests/fixtures/legacy_cleaning.py`` for the replay script and the
A1/A2 tests.

To use from a Colab notebook, ensure the package is importable first::

    import sys, os
    sys.path.insert(0, "/path/to/repo/src")   # where landval/ lives
"""

# ======================================================================
# CELL 45  —  size constants + import  (replaces the clean_size def)
# ======================================================================
CELL_45 = r'''
# ---- A1: corrected size parsing (replaces the old clean_size def) ----
# Source of truth: src/landval/cleaning/size.py.  The notebook imports it
# so the backend tests (backend/tests/test_cleaning_size.py) and this
# notebook share ONE implementation.
from landval.cleaning.size import (
    HA_TO_ACRES,
    SQM_TO_ACRES,
    SQFT_TO_ACRES,
    PLOT_50x100_ACRES,
    M2_MIN_PLAUSIBLE,
    clean_size_record,
    clean_sizes,
    parse_size_string,
    extract_description_sizes,
)

# Constants kept as module-level names for parity with downstream cells
# that reference them directly (e.g.EDA plots).
HA_TO_ACRES      = HA_TO_ACRES      # 2.4711
SQM_TO_ACRES     = SQM_TO_ACRES     # 0.000247105
SQFT_TO_ACRES    = SQFT_TO_ACRES    # 0.0000229568
PLOT_50x100_ACRES = PLOT_50x100_ACRES  # 0.1148
M2_MIN_PLAUSIBLE = M2_MIN_PLAUSIBLE  # 100

print("A1 size cleaning loaded from landval.cleaning.size")
print(f"  M2_MIN_PLAUSIBLE = {M2_MIN_PLAUSIBLE}  (sqm values below this are treated as acres)")
'''

# ======================================================================
# CELL 47  —  apply clean_sizes  (replaces df["size"].apply(clean_size))
# ======================================================================
CELL_47 = r'''
# ---- A1: vectorised size cleaning over column + erf_size + description ----
# Source priority: (i) df["size"], (ii) df["erf_size"], (iii) description.
# Adds: size_acres, size_source, size_note, size_conflict, size_multi_match.
_size_in = df[["size", "erf_size", "description"]]
df = pd.concat(
    [df.drop(columns=[c for c in _size_in.columns if c in df.columns], errors="ignore"),
     clean_sizes(_size_in)],
    axis=1,
)

print("Size source breakdown after corrected cleaning:")
print(df["size_source"].value_counts())
print(f"\nMissing after corrected pass: {df['size_acres'].isnull().sum()}")
print(f"size_conflict rows:           {int(df['size_conflict'].sum())}")
print(f"size_multi_match rows:        {int(df['size_multi_match'].sum())}")
print(f"rows with size_acres == 0:    {int((df['size_acres'] == 0).sum())}")
'''

# ======================================================================
# CELL 49  —  description fallback  (now integrated into clean_sizes)
# ======================================================================
CELL_49 = r'''
# ---- A1: the description fallback is now INSIDE clean_sizes (Cell 47) ----
# This cell is kept only for parity with the old Cell 49's reporting and
# to surface the description-derived rows for inspection.  No mutation of
# df happens here — clean_sizes already populated size_acres from the
# description when neither df["size"] nor df["erf_size"] was usable.

_desc_sourced = df["size_source"] == "nlp_description"
print(f"Rows whose size came from the description fallback: {int(_desc_sourced.sum())}")
print(
    "Distinct size values in the description (size_multi_match=True): "
    f"{int(df['size_multi_match'].sum())} rows"
)

# Optional sanity: how many description rows had > 1 distinct size mention?
if _desc_sourced.any():
    print("\nsize_note breakdown:")
    print(df.loc[_desc_sourced, "size_note"].value_counts(dropna=False))
'''

# ======================================================================
# CELL 167 —  price_per_acre  (replaces price_ksh / size_acres)
# ======================================================================
CELL_167 = r'''
# ---- A2: corrected price basis + price_per_acre (replaces Cell 167) ----
# Source of truth: src/landval/cleaning/price_basis.py.
from landval.cleaning.price_basis import (
    PRICE_BASIS_MODE,
    detect_price_basis,
    resolve_prices,
    clean_price_basis,
)

# Keep the raw listed price before we overwrite price_ksh with the TOTAL.
df["price_listed_raw_ksh"] = df["price_ksh"]

# clean_price_basis rewrites price_ksh -> corrected TOTAL and sets
# price_per_acre, price_basis, price_basis_conflict.  Default mode is
# "convert" (per-acre listings are reinterpreted as per-acre prices).
df = clean_price_basis(
    df,
    size_col="size_acres",
    price_col="price_ksh",
    desc_col="description",
    mode=PRICE_BASIS_MODE,   # "convert"
)

# log_price_per_acre mirrors the old Cell 167's companion column.
df["log_price_per_acre"] = np.where(
    df["price_per_acre"].notnull() & (df["price_per_acre"] > 0),
    np.log(df["price_per_acre"]),
    np.nan,
)

print(f"PRICE_BASIS_MODE = {PRICE_BASIS_MODE!r}")
print("price_basis breakdown:")
print(df["price_basis"].value_counts(dropna=False))
print(f"\nprice_per_acre valid     : {df['price_per_acre'].notnull().sum():,}")
print(f"log_price_per_acre valid : {df['log_price_per_acre'].notnull().sum():,}")
print(f"rows with inf ppa        : {int(np.isinf(df['price_per_acre'].to_numpy(dtype=float)).sum())}")
'''

# ======================================================================
# CELL 169 —  FINAL_COLUMNS additions  (additive)
# ======================================================================
CELL_169_ADDITIONS = r'''
# ---- A1/A2: add the new cleaning columns to FINAL_COLUMNS ----
# Paste these into the existing Cell 169 FINAL_COLUMNS list (additive —
# do NOT remove the existing entries).
#
# Under "Size":
#   "size_acres", "size_source", "log_size_acres",
#   "size_note", "size_conflict", "size_multi_match",
# Under "Price":
#   "price_ksh", "price_flag", "log_price_ksh",
#   "price_listed_raw_ksh", "price_basis", "price_basis_conflict",
# Under "Target variables":
#   "price_per_acre", "log_price_per_acre",

# The full replacement list (copy verbatim into Cell 169):
FINAL_COLUMNS = [
    # Identifiers (kept for traceability, not used as model features)
    "listing_url", "listing_no", "title", "location", "prop_type", "list_date",
    # Price
    "price_ksh", "price_flag", "log_price_ksh",
    "price_listed_raw_ksh", "price_basis", "price_basis_conflict",
    # Size
    "size_acres", "size_source", "log_size_acres",
    "size_note", "size_conflict", "size_multi_match",
    # Coordinates
    "latitude", "longitude", "geocode_source", "geocode_confidence",
    # Proximity
    "county", "dist_to_nairobi_km", "dist_to_county_town_km",
    "dist_to_water_body_km", "reference_city", "reference_city_dist_km",
    # Pillar scores
    "amenities_score", "accessibility_score",
    "amenities_score_osm", "accessibility_score_osm",
    "infrastructure_score", "infra_source",
    "infra_borehole", "infra_piped_water", "infra_river_water", "infra_water_tank",
    "infra_grid_electric", "infra_solar_electric", "infra_full_fence", "infra_partial_fence",
    "infra_structures", "infra_internal_road",
    # Target variables
    "price_per_acre", "log_price_per_acre",
]

final_cols = [c for c in FINAL_COLUMNS if c in df.columns]
df         = df[final_cols]
gc.collect()

print(f"Final columns : {len(final_cols)}")
print(f"Final records : {len(df):,}")
'''

# ----------------------------------------------------------------------
# Programmatic export: a dict so a downstream cell-injector can pull the
# source strings by label.
# ----------------------------------------------------------------------
REPLACEMENT_CELLS = {
    45: CELL_45,
    47: CELL_47,
    49: CELL_49,
    167: CELL_167,
    "169_FINAL_COLUMNS": CELL_169_ADDITIONS,
}

if __name__ == "__main__":
    import json

    print(json.dumps({str(k): v for k, v in REPLACEMENT_CELLS.items()}, indent=2))
