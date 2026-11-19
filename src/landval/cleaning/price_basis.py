"""A2 — corrected price-basis detection for the Kenya Land Valuation pipeline.

This module replaces Notebook 1 Cell 28's assumption that every parsed
price is the TOTAL and Cell 167's ``price_per_acre = price_ksh / size_acres``.

The bug
------
679 of 3,929 usable rows carry a "per acre" phrase in the description, and
many of those listed prices are PER-ACRE prices (e.g. listing 110468626:
``"elling at 250K per acre"`` with a listed price of KSh 250,000).  Cell 167
divided 250,000 by 4,000 acres and reported KSh 62.5 / acre.

The fix
-------
``detect_price_basis(price_ksh, description)`` decides whether the listed
price is the per-acre price or the parcel total:

* Find every per-acre phrase (``per acre``, ``/ acre``, ``each acre``,
  ``per ac``).
* Within ±40 characters of each phrase, extract money amounts supporting
  shorthand ``K`` / ``m`` / ``M`` / ``million`` / ``b``, comma-thousands,
  and ``Ksh`` / ``KES`` / ``USD`` / ``$`` prefixes (e.g. ``"250K"``,
  ``"7m"``, ``"1.8m"``, ``"35 M"``, ``"35 million"``, ``"550,000"``,
  ``"Ksh 220,000/-"``, ``"KES 25m"``).
* **Spec refinement (reported):** an amount whose connecting text to the
  phrase contains a total-indicator word (``total``, ``whole``, ``entire``,
  ``parcel``, ``sum``, ``aggregate``) is NOT treated as a per-acre
  candidate.  This resolves the tension the literal ±40 window creates on
  rows like 116846923 (``"7m per acre and total 5 acres at 35m"``) and -6
  (``"100m per acre total 500m"``), where the parcel-total amount falls
  inside the ±40 window AND equals the listed price — the literal rule
  would label them ``per_acre``, but the spec's asserted values demand
  ``total``.
* If any per-acre candidate equals ``price_ksh`` within 1 % → ``per_acre``.
* Else if a phrase exists but no candidate matches → ``total``,
  ``conflict=True`` (the price IS the total; the per-acre figure is a
  different number).
* Else (no phrase) → ``total``, ``conflict=False``.
* NaN price → ``unknown``.

``resolve_prices(price_ksh, size_acres, basis, mode)`` then produces
``price_per_acre`` and ``total_price_ksh`` according to ``PRICE_BASIS_MODE``
(``"convert"`` default, ``"exclude"``, ``"flag_only"``).

Output columns: ``price_basis``, ``price_basis_conflict``,
``price_listed_raw_ksh``.  The downstream ``price_ksh`` column holds the
corrected TOTAL (the backend schema documents ``price_ksh`` as "Listed
total price").
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
import pandas as pd

PriceBasis = Literal["per_acre", "total", "unknown"]
PriceBasisMode = Literal["convert", "exclude", "flag_only"]

#: Default resolution mode.  ``convert`` reinterprets per-acre listings as
#: per-acre prices (price_per_acre = listed price; total = listed × size).
PRICE_BASIS_MODE: PriceBasisMode = "convert"

#: per-acre phrase regex (case-insensitive).
PER_ACRE_PHRASE_RE = re.compile(r"per\s*acre|/\s*acre|each\s*acre|per\s*ac\b", re.IGNORECASE)

#: Window (characters, before or after the phrase) within which a money
#: amount is considered a per-acre candidate.
PER_ACRE_WINDOW = 40

#: Match-tolerance for "amount == listed price".
PRICE_MATCH_TOL = 0.01

#: Words that mark an amount as the parcel TOTAL, not the per-acre price.
#: An amount whose gap text to the per-acre phrase contains any of these is
#: excluded from the per-acre candidates (see module docstring).
TOTAL_INDICATOR_RE = re.compile(r"\b(total|whole|entire|parcel|sum|aggregate)\b", re.IGNORECASE)

#: Money regex.  Captures an optional currency prefix, a number (comma
#: thousands OR plain/decimal), an optional magnitude suffix, and an
#: optional trailing ``/-`` (Ksh .../-).  Compiled case-insensitive so
#: ``m``/``M`` and ``Ksh``/``ksh`` both match.
_MONEY_RE = re.compile(
    r"(?:(?P<cur>Ksh|KES|USD|\$)\.?\s*)?"
    r"(?P<num>\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)"
    r"\s*"
    r"(?P<suf>million|billion|k|m|b)?"
    r"\s*/?-?",
    re.IGNORECASE,
)

_SUFFIX_SCALE = {
    "k": 1_000,
    "m": 1_000_000,
    "million": 1_000_000,
    "b": 1_000_000_000,
    "billion": 1_000_000_000,
}


@dataclass
class MoneyAmount:
    """One money amount found in free text."""

    value: float
    start: int
    end: int
    has_suffix: bool
    has_currency: bool
    has_commas: bool

    @property
    def is_money(self) -> bool:
        """Bare numbers (no suffix, no currency, no commas) are NOT money —
        they are acre counts, phone numbers, etc."""
        return self.has_suffix or self.has_currency or self.has_commas


def _extract_money_amounts(text: Any) -> list[MoneyAmount]:
    """All money amounts in `text`, in text order."""
    if text is None or (isinstance(text, float) and math.isnan(text)):
        return []
    s = str(text)
    out: list[MoneyAmount] = []
    for m in _MONEY_RE.finditer(s):
        num_str = m.group("num")
        suf = m.group("suf")
        cur = m.group("cur")
        if num_str is None:
            continue
        try:
            num = float(num_str.replace(",", ""))
        except ValueError:
            continue
        scale = _SUFFIX_SCALE.get((suf or "").lower(), None) if suf else None
        value = num * scale if scale is not None else num
        out.append(
            MoneyAmount(
                value=value,
                start=m.start(),
                end=m.end(),
                has_suffix=suf is not None,
                has_currency=cur is not None,
                has_commas="," in num_str,
            )
        )
    return out


def _gap_between(text: str, phrase_start: int, phrase_end: int, amt: MoneyAmount) -> str:
    """The text strictly between the amount and the phrase (empty if they
    are adjacent or overlapping).  Used to detect total-indicator words
    that mark an amount as the parcel total rather than the per-acre price."""
    if amt.end <= phrase_start:  # amount before phrase
        return text[amt.end:phrase_start]
    if amt.start >= phrase_end:  # amount after phrase
        return text[phrase_end:amt.start]
    return ""


def _within_window(phrase_start: int, phrase_end: int, amt: MoneyAmount) -> bool:
    """True when the amount sits within PER_ACRE_WINDOW chars of the phrase."""
    if amt.end <= phrase_start:  # before
        return (phrase_start - amt.end) <= PER_ACRE_WINDOW
    if amt.start >= phrase_end:  # after
        return (amt.start - phrase_end) <= PER_ACRE_WINDOW
    return True  # overlapping (rare) — treat as within


def detect_price_basis(price_ksh: Any, description: Any) -> tuple[PriceBasis, bool]:
    """Decide whether `price_ksh` is a per-acre price or the parcel total.

    Returns ``(basis, conflict)``.
    """
    if price_ksh is None or (isinstance(price_ksh, float) and math.isnan(price_ksh)):
        return "unknown", False
    try:
        price = float(price_ksh)
    except (TypeError, ValueError):
        return "unknown", False
    if not math.isfinite(price) or price <= 0:
        return "unknown", False

    desc = "" if description is None or (isinstance(description, float) and math.isnan(description)) else str(description)
    phrases = list(PER_ACRE_PHRASE_RE.finditer(desc))
    if not phrases:
        return "total", False

    amounts = [a for a in _extract_money_amounts(desc) if a.is_money]

    for ph in phrases:
        pstart, pend = ph.start(), ph.end()
        for amt in amounts:
            if not _within_window(pstart, pend, amt):
                continue
            gap = _gap_between(desc, pstart, pend, amt)
            if TOTAL_INDICATOR_RE.search(gap):
                # "and total 5 acres at 35m" — the 35m is the TOTAL, not per-acre.
                continue
            if price > 0 and abs(amt.value - price) / price <= PRICE_MATCH_TOL:
                return "per_acre", False

    # A per-acre phrase exists but no candidate matches the listed price.
    return "total", True


@dataclass
class ResolvedPrice:
    price_per_acre: float
    total_price_ksh: float


def resolve_prices(
    price_ksh: Any, size_acres: Any, basis: PriceBasis, mode: PriceBasisMode = PRICE_BASIS_MODE
) -> ResolvedPrice:
    """Compute (price_per_acre, total_price_ksh) from the listed price,
    the parsed size, the detected basis, and the resolution mode.

    - ``convert`` (default): per_acre rows -> price_per_acre = listed,
      total = listed × size.  total rows -> price_per_acre = listed / size,
      total = listed.
    - ``exclude``: per_acre rows -> NaN / NaN (drop them from the per-acre
      distribution).  total rows behave as ``convert``.
    - ``flag_only``: behave like today (price is total) but keep the
      ``price_basis`` column for downstream filtering.
    """
    nan = float("nan")

    def _f(v: Any) -> float:
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return nan
        try:
            f = float(v)
        except (TypeError, ValueError):
            return nan
        return f if math.isfinite(f) else nan

    price = _f(price_ksh)
    size = _f(size_acres)

    if basis == "per_acre":
        if mode == "exclude":
            return ResolvedPrice(nan, nan)
        if mode == "flag_only":
            # today's behaviour: price is the total; per-acre = price / size
            ppa = price / size if size > 0 else nan
            return ResolvedPrice(ppa, price)
        # convert
        ppa = price
        total = price * size if size > 0 else nan
        return ResolvedPrice(ppa, total)

    # basis == "total" (or "unknown")
    ppa = price / size if size > 0 else nan
    return ResolvedPrice(ppa, price)


# ----------------------------------------------------------------------
# Frame-level helper (the replacement for Cell 167 + the price_ksh rewrite)
# ----------------------------------------------------------------------


def clean_price_basis(
    df: pd.DataFrame,
    *,
    size_col: str = "size_acres",
    price_col: str = "price_ksh",
    desc_col: str = "description",
    mode: PriceBasisMode = PRICE_BASIS_MODE,
) -> pd.DataFrame:
    """Add ``price_basis``, ``price_basis_conflict``, ``price_listed_raw_ksh``
    to `df`; overwrite ``price_ksh`` with the corrected TOTAL; set
    ``price_per_acre`` from ``resolve_prices``.

    Expected input: a frame that already has a parsed ``price_ksh`` (from
    Cell 28's ``clean_price``) and a parsed ``size_acres`` (from
    ``landval.cleaning.size``).
    """
    out = df.copy()
    out["price_listed_raw_ksh"] = out[price_col]

    bases: list[PriceBasis] = []
    conflicts: list[bool] = []
    ppas: list[float] = []
    totals: list[float] = []
    for price, size, desc in zip(
        out[price_col].tolist(), out[size_col].tolist(), out[desc_col].tolist()
    ):
        basis, conflict = detect_price_basis(price, desc)
        resolved = resolve_prices(price, size, basis, mode)
        bases.append(basis)
        conflicts.append(conflict)
        ppas.append(resolved.price_per_acre)
        totals.append(resolved.total_price_ksh)

    out["price_basis"] = bases
    out["price_basis_conflict"] = conflicts
    out["price_per_acre"] = ppas
    # The downstream price_ksh holds the corrected TOTAL.
    out[price_col] = totals
    return out
