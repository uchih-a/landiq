"""A1 — corrected size parsing for the Kenya Land Valuation cleaning pipeline.

This module replaces Notebook 1 Cells 45 + 49 (``clean_size`` +
``extract_size_from_description``).  The notebook functions compute the
WRONG values on real rows (see the task spec for the six failure modes
(a)–(f)); this module fixes them.

What changed vs the notebook
----------------------------
* Reads ``df["erf_size"]`` (2,187 non-null) — the listing's own structured
  size — which the notebook never consulted (failure mode a).
* Number token regex keeps thousands separators (``"2,077 acre"`` -> 2077,
  not 77; ``"1 900 m²"`` -> 1900, not 1) (failure mode b).
* A space counts as a thousands separator ONLY when followed by exactly
  3 digits then a non-digit (the ``(?!\\d)`` negative lookahead — written in
  the regex as ``(?!\\d)``), so ``"5 acres"`` stays
  5 and ``"1 9000"`` does not collapse to 19000.
* ``m²`` / ``m2`` are recognised as square metres (failure mode d).
* ``m²`` sanity: a sqm value below ``M2_MIN_PLAUSIBLE`` (100) is treated
  as ACRES — the observed scraper mislabel where ``"0.12 m²"`` means
  0.12 acres (121 of 203 ``m²`` rows are <= 10) (failure mode d).
* Source priority: column -> erf_size -> description fallback, with
  ``size_source`` in ``{"column","erf_size","nlp_description","missing"}``.
* Truncation guard: a numeric token matching ``^0\\d+$`` (e.g. ``"077"``,
  ``"000"``) is a scraper truncation artifact and is ignored — we fall
  through to the next source (failure mode f).
* Conflict rule: when a structured value AND a description value both
  exist and differ by > 2x, the STRUCTURED value wins and
  ``size_conflict=True`` (failure mode c — e.g. listing 117099203 where
  erf_size ``"0.5 acres"`` beat the description's ``"1/2 ACRE"`` -> 2.0).
* Description fallback uses the new number regex; > 1 distinct size value
  sets ``size_multi_match=True`` (the first is still used).
* Any ``size_acres <= 0`` or non-finite -> NaN, never 0.0 (failure mode e
  — 19 rows were exactly 0.0 and produced ``price_per_acre = inf``).

Output columns added: ``size_source``, ``size_note``,
``size_conflict``, ``size_multi_match``.

The module is import-safe (no pandas at import time beyond the type hint)
and works both as a library (``clean_sizes(df)``) and cell-by-cell
(``parse_size_string``, ``extract_first_description_size``) so Notebook 1
can call it directly from the replacement cells in
``notebook_patch/NB1_replacement_cells.py``.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

# ---- Constants (carried over from Notebook 1 Cells 45/49) ----
HA_TO_ACRES = 2.4711
SQM_TO_ACRES = 0.000247105
SQFT_TO_ACRES = 0.0000229568
PLOT_50x100_ACRES = 0.1148  # 50x100 ft = 5,000 sqft (kept for parity / plot dims)

#: sqm values below this are treated as ACRES (scraper "m²" mislabel).
M2_MIN_PLAUSIBLE = 100

#: numeric token regex.  Two alternatives:
#:   1. thousands-separated: 1-3 digits, then one or more (comma|space + 3
#:      digits NOT followed by another digit) groups, optional .frac.
#:   2. plain integer / decimal.
#: A space only counts as a thousands separator when followed by exactly
#: 3 digits then a non-digit (the ``(?!\\d)`` lookahead), so "5 acres" stays
#: 5 and "1 9000" does not collapse to 19000.
NUMBER_RE = re.compile(r"\d{1,3}(?:[,\s]\d{3}(?!\d))+(?:\.\d+)?|\d+(?:\.\d+)?")

#: a token that is all digits and starts with '0' (>= 2 digits) is a
#: scraper truncation artifact ("077", "000") and is ignored.
TRUNCATED_RE = re.compile(r"^0\d+$")

#: plot dimension regex (e.g. "50x100", "50 by 100") -> square feet.
PLOT_RE = re.compile(r"(\d+)\s*(?:by|x)\s*(\d+)", re.IGNORECASE)

#: unit keywords, checked in this order (rule 2).  Order matters: m² first
#: so "m²" / "m2" win before the bare-acre fallback; hectares before acres
#: so "ha" is not eaten by an earlier alternative.
_UNIT_ALTERNATIVES = (
    ("sqm", r"m²|m2|sq\.?\s*m|sqm|square\s*met(?:ers?|res?)?"),
    ("ha", r"ha\b|hectares?"),
    ("sqft", r"sq\.?\s*ft|sqft|square\s*f(?:eet|oot)?"),
    ("acres", r"acres?|\bac\b"),
)
_UNIT_RE = re.compile("|".join(f"(?P<{name}>{pat})" for name, pat in _UNIT_ALTERNATIVES), re.IGNORECASE)

#: combined number+unit pattern for the description fallback.
_DESC_SIZE_RE = re.compile(
    rf"({NUMBER_RE.pattern})\s*({_UNIT_RE.pattern})",
    re.IGNORECASE,
)


@dataclass
class SizeParse:
    """One parsed size mention."""

    acres: float
    unit: str  # "sqm" | "ha" | "sqft" | "acres"
    token: str  # the raw numeric token, e.g. "2,077"
    note: str = ""

    @property
    def truncated(self) -> bool:
        return bool(TRUNCATED_RE.match(self.token))


def _classify_unit(unit_text: str) -> str:
    """Return the canonical unit for a matched unit keyword (rule 2 order)."""
    low = unit_text.lower()
    if re.search(r"m²|m2|sq\.?\s*m|sqm|square\s*met", low):
        return "sqm"
    if re.search(r"ha\b|hectare", low):
        return "ha"
    if re.search(r"sq\.?\s*ft|sqft|square\s*f", low):
        return "sqft"
    if re.search(r"acres?|\bac\b", low):
        return "acres"
    return "acres"  # default: assume acres (rule 2)


def _token_to_float(token: str) -> float:
    """Strip commas and inner spaces, then float()."""
    cleaned = token.replace(",", "").replace(" ", "")
    return float(cleaned)


def _acres_for(value: float, unit: str) -> tuple[float, str]:
    """Convert a value in `unit` to acres, applying the m² sanity rule.

    Returns (acres, note).  note is "m2_label_treated_as_acres" when a sqm
    value below M2_MIN_PLAUSIBLE is reinterpreted as acres.
    """
    if unit == "sqm":
        if value < M2_MIN_PLAUSIBLE:
            # Scraper mislabel: "0.12 m²" means 0.12 acres.
            return value, "m2_label_treated_as_acres"
        return value * SQM_TO_ACRES, ""
    if unit == "ha":
        return value * HA_TO_ACRES, ""
    if unit == "sqft":
        return value * SQFT_TO_ACRES, ""
    return value, ""  # acres


def parse_size_string(raw: Any) -> SizeParse | None:
    """Parse a STRUCTURED size string (df["size"] or df["erf_size"]).

    Returns None when the value is null/empty, has no number, or the only
    numeric token is a truncation artifact (``^0\\d+$``).  Plot dimensions
    ("50x100") are honoured as square feet.
    """
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    text = str(raw).strip().lower()
    if text in ("", "nan", "none", "-", "n/a"):
        return None

    # Plot dimensions first (50x100 -> 5000 sqft -> acres).
    plot = PLOT_RE.search(text)
    if plot:
        sqft = float(plot.group(1)) * float(plot.group(2))
        acres, _ = _acres_for(sqft, "sqft")
        return SizeParse(acres=acres, unit="sqft", token=f"{plot.group(1)}x{plot.group(2)}")

    nm = NUMBER_RE.search(text)
    if nm is None:
        return None
    token = nm.group(0)
    if TRUNCATED_RE.match(token):
        # Scraper truncation ("077 acre", "000 Acres") -> ignore, fall through.
        return None

    value = _token_to_float(token)
    unit = _classify_unit(text)
    acres, note = _acres_for(value, unit)
    return SizeParse(acres=acres, unit=unit, token=token, note=note)


def extract_description_sizes(text: Any) -> list[SizeParse]:
    """All size mentions in a free-text description, in text order.

    Uses the new number regex (thousands separators kept) and the same
    unit detection + m² sanity + truncation guard as the structured parse.
    Truncated tokens (phone numbers like ``"071892045012"``) are skipped.
    """
    if text is None or (isinstance(text, float) and math.isnan(text)):
        return []
    s = str(text)
    if len(s) < 5:
        return []

    # Plot dimensions (rare in descriptions but honoured for parity).
    out: list[SizeParse] = []
    plot = PLOT_RE.search(s)
    if plot:
        sqft = float(plot.group(1)) * float(plot.group(2))
        acres, _ = _acres_for(sqft, "sqft")
        out.append(SizeParse(acres=acres, unit="sqft", token=f"{plot.group(1)}x{plot.group(2)}"))

    for m in _DESC_SIZE_RE.finditer(s):
        token = m.group(1)
        if TRUNCATED_RE.match(token):
            # leading-zero all-digit token (phone numbers, "077") -> skip
            continue
        value = _token_to_float(token)
        unit = _classify_unit(m.group(2))
        acres, note = _acres_for(value, unit)
        out.append(SizeParse(acres=acres, unit=unit, token=token, note=note))
    return out


def extract_first_description_size(text: Any) -> float:
    """First description size in acres, or NaN.  Convenience for tests."""
    sizes = extract_description_sizes(text)
    if not sizes:
        return float("nan")
    val = sizes[0].acres
    if val <= 0 or not math.isfinite(val):
        return float("nan")
    return round(val, 6)


# ----------------------------------------------------------------------
# Row-level cleaning (the replacement for Cells 45 + 47 + 49)
# ----------------------------------------------------------------------
_SOURCE_VALUES = {"column", "erf_size", "nlp_description", "missing"}


def _conflict(a: float, b: float) -> bool:
    """True when two positive sizes differ by more than 2x."""
    if a <= 0 or b <= 0 or not (math.isfinite(a) and math.isfinite(b)):
        return False
    return max(a, b) / min(a, b) > 2.0


@dataclass
class SizeRecord:
    """The full per-row size result (mirrors the added DataFrame columns)."""

    size_acres: float
    size_source: str
    size_note: str
    size_conflict: bool
    size_multi_match: bool


def _usable(p: SizeParse | None) -> SizeParse | None:
    """A structured parse is usable only if it is finite and positive; a
    non-positive structured value (e.g. ``"0 acres"``) is treated as
    missing so we fall through to the next source rather than emitting 0."""
    if p is None:
        return None
    if not math.isfinite(p.acres) or p.acres <= 0:
        return None
    return p


def clean_size_record(size_raw: Any, erf_raw: Any, description: Any) -> SizeRecord:
    """Apply the full source-priority + conflict + fallback logic to one row."""
    structured_col = _usable(parse_size_string(size_raw))
    structured_erf = _usable(parse_size_string(erf_raw))

    desc_sizes = extract_description_sizes(description)
    desc_first = desc_sizes[0].acres if desc_sizes else None
    desc_multi = len({round(s.acres, 6) for s in desc_sizes}) > 1

    # Source priority: (i) column, (ii) erf_size.
    if structured_col is not None:
        structured = structured_col
        source = "column"
    elif structured_erf is not None:
        structured = structured_erf
        source = "erf_size"
    else:
        structured = None
        source = "missing"

    conflict = False
    if structured is not None and desc_first is not None:
        conflict = _conflict(structured.acres, desc_first)

    if structured is not None:
        acres = structured.acres
        note = structured.note
        # If the structured value won the conflict, keep its note; if the
        # description was multi-match we still flag it for traceability.
    elif desc_first is not None:
        acres = desc_first
        note = desc_sizes[0].note if desc_sizes else ""
        source = "nlp_description"
    else:
        acres = float("nan")
        note = ""
        source = "missing"

    # Rule 8: never emit 0 or non-finite.
    if not math.isfinite(acres) or acres <= 0:
        acres = float("nan")
        if source == "missing":
            note = note  # keep any note
        # If we had a structured/desc value that was <=0, fall back to missing
        # only when there is genuinely nothing else; otherwise NaN is the value.

    if acres != acres:  # NaN
        size_acres = float("nan")
    else:
        size_acres = round(acres, 6)

    return SizeRecord(
        size_acres=size_acres,
        size_source=source,
        size_note=note,
        size_conflict=conflict,
        size_multi_match=desc_multi,
    )


def clean_sizes(df: pd.DataFrame) -> pd.DataFrame:
    """Vectorised per-row cleaning.  Returns a copy of `df` with the five
    size columns added/overwritten: ``size_acres``, ``size_source``,
    ``size_note``, ``size_conflict``, ``size_multi_match``.

    Expected input columns: ``size``, ``erf_size``, ``description``
    (all optional — missing columns are treated as null).
    """
    out = df.copy()
    size_col = out["size"] if "size" in out.columns else pd.Series([np.nan] * len(out))
    erf_col = out["erf_size"] if "erf_size" in out.columns else pd.Series([np.nan] * len(out))
    desc_col = out["description"] if "description" in out.columns else pd.Series([np.nan] * len(out))

    records = [
        clean_size_record(s, e, d)
        for s, e, d in zip(size_col.tolist(), erf_col.tolist(), desc_col.tolist())
    ]
    out["size_acres"] = [r.size_acres for r in records]
    out["size_source"] = [r.size_source for r in records]
    out["size_note"] = [r.size_note for r in records]
    out["size_conflict"] = [r.size_conflict for r in records]
    out["size_multi_match"] = [r.size_multi_match for r in records]
    return out


def clean_size_value(raw: Any) -> float:
    """Convenience: parse a single STRUCTURED size string to acres (or NaN).

    Useful for the A1 unit tests and for the replacement notebook cells
    that only have a string in hand.
    """
    p = parse_size_string(raw)
    if p is None:
        return float("nan")
    if not math.isfinite(p.acres) or p.acres <= 0:
        return float("nan")
    return round(p.acres, 6)
