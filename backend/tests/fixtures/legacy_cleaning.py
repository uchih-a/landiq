"""Verbatim copy of the CURRENT (legacy) Notebook 1 cleaning functions.

Part 0 baseline.  These are the EXACT functions from
``01_data_preparation_and_feature_engineering.ipynb``:

  - ``clean_price``                     (Cell 28)
  - ``clean_size``                      (Cell 45)
  - ``extract_size_from_description``   (Cell 49)

with the constants as they appear in those cells:
  HA_TO_ACRES = 2.4711
  SQM_TO_ACRES = 0.000247105
  SQFT_TO_ACRES = 0.0000229568
  PLOT_50x100_ACRES = 0.1148
  USD_TO_KSH_RATE = 129.50

The legacy pipeline (``legacy_pipeline`` below) reproduces what Notebook 1
actually does end-to-end on the cleaning side:

  1. ``clean_price(df["price"])``                -> ``price_ksh``
  2. ``clean_size(df["size"])`` ONLY             -> ``size_acres``  (df["erf_size"]
     is NEVER read)
  3. for rows where size_acres is NaN,
     ``extract_size_from_description(df["description"])``
  4. ``price_per_acre = price_ksh / size_acres``  (Cell 167)

Nothing here is "fixed" — this is the reference implementation the new
``landval.cleaning`` modules are compared against in tests and in
``scripts/replay_cleaning.py``.
"""

from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd

# ---- Constants (verbatim from Notebook 1 Cells 28 / 45) ----
HA_TO_ACRES = 2.4711
SQM_TO_ACRES = 0.000247105
SQFT_TO_ACRES = 0.0000229568
PLOT_50x100_ACRES = 0.1148  # 50x100 ft = 5,000 sqft   (kept for parity; not used by clean_size)
USD_TO_KSH_RATE = 129.50


# ----------------------------------------------------------------------
# Cell 28 — clean_price (VERBATIM)
# ----------------------------------------------------------------------
def clean_price(raw_value: Any):
    """
    Parse a raw price string into a float in KSh.

    Returns
    -------
    (price_ksh : float | NaN, flag : str)

    Flags
    -----
    clean         : standard KSh value
    converted_usd : was USD, converted to KSh
    missing       : null, empty, or unparseable
    negotiable    : price on request / POA / negotiable
    ambiguous     : has digits but currency is unclear
    """
    if pd.isnull(raw_value):
        return np.nan, "missing"

    text = str(raw_value).strip()

    if text == "" or text.lower() in ["nan", "none", "-", "n/a"]:
        return np.nan, "missing"

    if re.search(r'request|poa|negotiable|contact|call', text, re.IGNORECASE):
        return np.nan, "negotiable"

    is_usd = bool(re.search(r'USD|\$|usd', text))
    is_ksh = bool(re.search(r'[Kk][Ss][Hh]|KES', text))

    # Handle M / B shorthand before stripping letters
    shorthand_match = re.search(r'([\d]+(?:\.[\d]+)?)\s*([MB])', text, re.IGNORECASE)
    if shorthand_match:
        number    = float(shorthand_match.group(1))
        suffix    = shorthand_match.group(2).upper()
        price_val = number * (1_000_000 if suffix == "M" else 1_000_000_000)
        flag      = "converted_usd" if is_usd else "clean"
        if is_usd:
            price_val *= USD_TO_KSH_RATE
        return price_val, flag

    numeric_str = re.sub(r'[^\d\.]', '', text)

    if numeric_str == "" or numeric_str == ".":
        return np.nan, "missing"

    # European-style thousand separators: "20.000.000" → "20000000"
    if numeric_str.count(".") > 1:
        parts = numeric_str.split(".")
        numeric_str = "".join(parts[:-1]) + "." + parts[-1]

    try:
        price_val = float(numeric_str)
    except ValueError:
        return np.nan, "ambiguous"

    # Values below 1,000 are almost certainly parsing errors for Kenyan land prices
    if price_val < 1_000:
        return np.nan, "ambiguous"

    if is_usd:
        return price_val * USD_TO_KSH_RATE, "converted_usd"

    if not is_ksh and not is_usd:
        return price_val, "ambiguous"

    return price_val, "clean"


# ----------------------------------------------------------------------
# Cell 45 — clean_size (VERBATIM)
# ----------------------------------------------------------------------
def clean_size(raw: Any):
    """
    Parse a raw size string into decimal acres.

    Returns
    -------
    (size_acres : float | NaN, source : str)

    Source values: 'column' | 'missing'
    """
    if pd.isnull(raw):
        return np.nan, "missing"

    text = str(raw).strip().lower()

    if text in ["", "nan", "none", "-"]:
        return np.nan, "missing"

    text = re.sub(r'one\s*and\s*a?\s*half', '1.5', text)
    text = re.sub(r'\bhalf\b',               '0.5', text)
    text = re.sub(r'\bquarter\b',            '0.25', text)
    text = re.sub(r'\bthree\s*quarter',      '0.75', text)

    plot_match = re.search(r'(\d+)\s*(?:by|x)\s*(\d+)', text)
    if plot_match:
        sqft = float(plot_match.group(1)) * float(plot_match.group(2))
        return round(sqft * SQFT_TO_ACRES, 6), "column"

    num_match = re.search(r'([\d]+(?:\.[\d]+)?)', text)
    if not num_match:
        return np.nan, "missing"

    val = float(num_match.group(1))

    if re.search(r'ha\b|hectare', text):
        return round(val * HA_TO_ACRES, 4), "column"
    if re.search(r'sq\.?\s*m|square\s*met|sqm', text):
        return round(val * SQM_TO_ACRES, 6), "column"
    if re.search(r'sq\.?\s*ft|square\s*f|sqft', text):
        return round(val * SQFT_TO_ACRES, 6), "column"
    if re.search(r'acres?', text):
        return round(val, 4), "column"

    return round(val, 4), "column"  # default: assume acres


# ----------------------------------------------------------------------
# Cell 49 — extract_size_from_description (VERBATIM, function only)
# ----------------------------------------------------------------------
def extract_size_from_description(text: Any):
    """
    Mine the description for size mentions as a fallback.
    Returns (size_acres : float | NaN, source : str).
    """
    if pd.isnull(text) or len(str(text)) < 20:
        return np.nan, "missing"

    text = str(text).lower()
    text = re.sub(r'one\s*and\s*a?\s*half', '1.5', text)
    text = re.sub(r'\bhalf\b',               '0.5', text)
    text = re.sub(r'\bquarter\b',            '0.25', text)

    plot_match = re.search(r'(\d+)\s*(?:by|x)\s*(\d+)', text)
    if plot_match:
        sqft = float(plot_match.group(1)) * float(plot_match.group(2))
        return round(sqft * SQFT_TO_ACRES, 6), "nlp_description"

    m = re.search(r'([\d]+(?:\.[\d]+)?)\s*[-]?\s*acres?', text)
    if m:
        return round(float(m.group(1)), 4), "nlp_description"

    m = re.search(r'([\d]+(?:\.[\d]+)?)\s*(?:ha|hectares?)', text)
    if m:
        return round(float(m.group(1)) * HA_TO_ACRES, 4), "nlp_description"

    m = re.search(r'([\d]+(?:\.[\d]+)?)\s*(?:sq\.?\s*m|sqm|square\s*met)', text)
    if m:
        return round(float(m.group(1)) * SQM_TO_ACRES, 6), "nlp_description"

    return np.nan, "missing"


# ----------------------------------------------------------------------
# Legacy pipeline (reproduces Notebook 1 end-to-end on the cleaning side)
# ----------------------------------------------------------------------
def legacy_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    """Reproduce Notebook 1's cleaning pipeline on a frame that already has
    the raw columns ``price``, ``size``, ``description``.

    Returns a copy with ``price_ksh``, ``price_flag``, ``size_acres``,
    ``size_source`` and ``price_per_acre`` columns.  ``df["erf_size"]`` is
    deliberately NOT consulted (that is the bug Part 1 fixes).
    """
    out = df.copy()

    price_pairs = out["price"].apply(clean_price)
    out["price_ksh"] = price_pairs.apply(lambda x: x[0])
    out["price_flag"] = price_pairs.apply(lambda x: x[1])

    size_pairs = out["size"].apply(clean_size)
    out["size_acres"] = size_pairs.apply(lambda x: x[0])
    out["size_source"] = size_pairs.apply(lambda x: x[1])

    missing_mask = out["size_acres"].isnull()
    if missing_mask.any():
        fallback = out.loc[missing_mask, "description"].apply(extract_size_from_description)
        out.loc[missing_mask, "size_acres"] = fallback.apply(lambda x: x[0])
        out.loc[missing_mask, "size_source"] = fallback.apply(lambda x: x[1])

    out["price_per_acre"] = out["price_ksh"] / out["size_acres"]
    return out
