# Data dictionary and cleaning rules

Two-line summary: every column in the scraped CSV and the engineered
frame, with units and the exact size-parsing order and price-basis rules
that turn them into the modelling target — plus the row counts before and
after each cleaning step.

For: anyone tracing a number in the app back to a raw listing, and
maintainers changing the cleaning pipeline.

![Data and model pipeline: the Raw listings CSV is cleaned in three stages — size parsing, price basis, feature engineering — then branched to XGBoost, CatBoost and TabNet, combined into a weighted ensemble, wrapped in a split-conformal 80% range, and passed through a serve-time suspect gate](assets/diagrams/02-data-model-pipeline.png)

*Figure — data and model pipeline: cleaning order, the three-model ensemble, and the 80% range. Owner-provided, 2026-11-25.*

## Source

`property24_kenya_finals.csv` — 5,875 rows, 12 columns, scraped from
**Property24 Kenya** by the external scraper repo
[github.com/uchih-a/scrapper](https://github.com/uchih-a/scrapper).
**BuyRentKenya** is a secondary source the same scraper targets, but its
rows are **not** in the committed CSV or the trained model in this
snapshot. These are **asking prices**. See
[data-and-legal.md](data-and-legal.md) for sources, date range, and
personal-data findings.

## Raw columns (`property24_kenya_finals.csv`)

| Column | Type | Non-null | Meaning |
|---|---|---|---|
| `listing_no` | str/int | 5,875 | portal listing identifier (negative values mark fixture/synthetic rows) |
| `title` | str | 5,875 | listing headline, e.g. "Vacant Land / Plot for Sale in Ruiru" |
| `price` | str | 5,481 | listed price as scraped (may include text/currency) |
| `location` | str | 5,413 | free-text location, e.g. "Ruiru" |
| `street_address` | str | — | plus-code / street text where present |
| `erf_size` | str | 2,187 | the listing's own structured size field (from the portal) |
| `property_type` | str | — | portal's raw type label |
| `list_date` | str | 2,284 | listing date, e.g. "8-Apr-26"; **empty for most rows** — no date features exist in the model |
| `description` | str | — | free-text description (source of the size/price-basis fallbacks) |
| `listing_url` | str | 5,875 | source URL (carried into every export for traceability) |
| `prop_type` | str | 783 | "Vacant Land / Plot" for the rest; the canonical Land/Farm/Commercial mapping is derived in Notebook 1 cells 60–100 |
| `size` | str | 486 | scraped size text, e.g. "0.5 acres" |

## Engineered frame (Notebook 1 output, 40 `FINAL_COLUMNS`)

Identifier + text: `listing_url`, `listing_no`, `title`, `location`,
`prop_type`, `list_date`.

Price: `price_ksh` (cleaned numeric, KSh), `price_flag`,
`log_price_ksh`, `price_per_acre`, `log_price_per_acre` (**the target**),
plus the A2 columns `price_basis`, `price_basis_conflict`.

Size: `size_acres`, `log_size_acres`, and the A1 flags `size_source`,
`size_note`, `size_conflict`, `size_multi_match`.

Geography: `latitude`, `longitude`, `geocode_source`,
`geocode_confidence`, `county`, `dist_to_nairobi_km`,
`dist_to_county_town_km`, `dist_to_water_body_km`, `reference_city`,
`reference_city_dist_km`.

Scores: `amenities_score`, `accessibility_score` (text-boosted,
evaluation-only), `amenities_score_osm`, `accessibility_score_osm`
(OSM-derived, production candidates), `infrastructure_score`,
`infra_source`, and the 10-item checklist `infra_borehole`,
`infra_piped_water`, `infra_river_water`, `infra_water_tank`,
`infra_grid_electric`, `infra_solar_electric`, `infra_full_fence`,
`infra_partial_fence`, `infra_structures`, `infra_internal_road`.

## Size parsing order (`src/landval/cleaning/size.py`)

Sources are tried in priority order; the first usable value wins and is
recorded in `size_source`:

1. **`column`** — the scraped `size` field (482 rows).
2. **`erf_size`** — the portal's structured size (1,701 rows), which the
   original notebook never consulted.
3. **`nlp_description`** — first distinct size value parsed from the
   description text (1,784 rows); more than one distinct value sets
   `size_multi_match = True`.
4. **`missing`** — no usable source (1,908 rows); `size_acres` is NaN,
   never a fabricated 0.

Parsing rules within a source:

- Unit order matters: **m² → hectares → sq ft → acres** (so "1 900 m²"
  reads as 1900 sqm, not 1 acre). Conversions: `HA_TO_ACRES = 2.4711`,
  `SQM_TO_ACRES = 0.000247105`, `SQFT_TO_ACRES = 0.0000229568`.
- Number tokens keep thousands separators ("2,077 acre" → 2077, not 77);
  a space counts as a separator only before exactly 3 digits +
  non-digit, so "5 acres" stays 5.
- m² sanity: a sqm value below `M2_MIN_PLAUSIBLE` (100) is treated as
  **acres** — the observed scraper mislabel where "0.12 m²" means 0.12
  acres.
- Truncation guard: a token matching `^0\d+$` (e.g. "077") is a scraper
  truncation artifact and is ignored.
- Conflict: when a structured value and a description value both exist
  and differ by more than 2×, the structured value wins and
  `size_conflict = True`.
- Any `size_acres ≤ 0` or non-finite → NaN (19 rows were exactly 0.0 and
  produced `price_per_acre = inf` under the legacy rules).

## Price-basis rules (`src/landval/cleaning/price_basis.py`)

The scraped `price` is usually the **parcel total**, but 679 of 3,929
usable rows carry a "per acre" phrase and many of those prices are
per-acre (e.g. "selling at 250K per acre" with a listed price of
KSh 250,000). `detect_price_basis` decides:

1. Find every per-acre phrase ("per acre", "/ acre", "each acre",
   "per ac").
2. Within ±40 characters, extract money amounts supporting `K`/`m`/`M`/
   `million`/`b`, comma-thousands, and Ksh/KES/USD/$ prefixes.
3. An amount whose connecting text contains a total-indicator word
   (`total`, `whole`, `entire`, `parcel`, `sum`, `aggregate`) is NOT a
   per-acre candidate (resolves "7m per acre and total 5 acres at 35m").
4. Any per-acre candidate equal to `price_ksh` within 1% → **`per_acre`**;
   phrase but no match → **`total`** with `price_basis_conflict = True`;
   no phrase → **`total`**, no conflict; NaN price → `unknown`.

Resolution (`PRICE_BASIS_MODE = "convert"`, the default): per-acre
listings are reinterpreted as per-acre prices
(`price_per_acre = listed price`; `total = listed × size`). The
alternatives `"exclude"` and `"flag_only"` exist but are not used in
production.

## Cleaning outcome (authoritative run, 2026-11-24)

From `python scripts/replay_cleaning.py` over the committed CSV
(5,875 rows):

| Measure | Legacy rules | Corrected rules |
|---|---|---|
| usable `price_per_acre` rows | 3,929 | **3,958** |
| `size_acres == 0` rows | 19 | **0** |
| `inf price_per_acre` rows | 18 | **0** |
| size changed (>1%) | — | 553 |
| `size_conflict` | — | 153 |
| median price/acre (finite, >0) | KSh 34,848,062 | **KSh 30,492,055** |
| p1 / p99 price/acre | 11,000 / 600,000,000 | 14,013 / 700,000,000 |

`size_source` counts: column 482, erf_size 1,701, nlp_description 1,784,
missing 1,908. `price_basis` counts: total 5,008, per_acre 354, unknown
513.

Downstream (fixture-built `listings_scored.parquet`, the file the app
serves): 5,879 rows (5,875 + synthetic edge rows), of which 3,544 are
non-suspect and 2,335 are suspect (1,910 `non_finite_size`, 377
`listed_far_below_model`, 48 `listed_far_above_model`).

## Flags reference

| Flag | Set by | Meaning |
|---|---|---|
| `size_source` | size parser | which source produced `size_acres` |
| `size_conflict` | size parser | structured vs description size differ > 2× |
| `size_multi_match` | size parser | description contained >1 distinct size |
| `size_note` | size parser | e.g. `m2_label_treated_as_acres` |
| `price_basis` | price-basis detector | `per_acre` / `total` / `unknown` |
| `price_basis_conflict` | price-basis detector | per-acre phrase present but price is the total |
| `price_flag` | price cleaning | legacy price-parse note |
| `data_quality_flag` | Notebook 3 Cell 9.6 | log price/acre outside the development target's 1st–99th percentile window; excluded from training |
| `is_suspect` / `suspect_reason` | backend suspect gate (serve time) | `listed_over_predicted` outside [0.05, 20] or non-finite size; excluded from verdict counts |
| `geocode_source` / `geocode_confidence` | geocoding | where coordinates came from and how precise |
