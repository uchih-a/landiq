# Known Gaps and Open Items

This is the consolidated list of every "report, don't fix" item raised across
all phases (B0–B10).  Each item was deliberately left as-is at the time and
flagged in the corresponding phase's final reply.  They are collected here
in one place so the next maintainer knows what was approximated, what was
stubbed, and what coverage gaps were accepted.

## B0 — Repo scaffolding

1. **Mypy errors in pre-existing files** — `backend/app/core/logging.py` has
   2 mypy errors (ConsoleRenderer vs JSONRenderer type mismatch, list item
   type incompatibility).  The CI config runs mypy leniently
   (`mypy ... || true`) so these don't fail the build.  Not fixed — flagged
   in B0's final reply.

2. **Pre-commit config** references `ruff` and `mypy` hooks but the hooks
   were not verified to run in a real pre-commit install (the repo was
   scaffolded, not git-initialized in this environment).

## B1 — Feature pipeline

3. **Pre-existing mypy errors in B1 files** — `counties.py` (lines 79, 81,
   86: `Any | None` attribute access on `_gdf` which is `None` before lazy
   load), `infrastructure.py` (line 121: `dict[str, int]` vs
   `dict[str, int | None]` variance), `amenities.py` (line 120: `None` has
   no attribute `memory_usage` on `_pois_gdf`).  6 errors total.  Not fixed
   — the lenient mypy CI config tolerates them.

4. **`src/landval/__init__.py` and `src/landval/features/__init__.py` are
   empty** — intentional package markers, not a gap.

5. **`conftest.py` originally did not add `<repo>/src/` to `sys.path`** —
   fixed in B2 (one-line addition) because tests couldn't import `landval`
   without it.  Flagged at the time as a pre-existing B0/B1 bug.

6. **`scripts/parity_test.py` had the same `src/` path bug** — fixed in B2
   alongside the conftest fix.  Also has a pre-existing unused variable
   (`county` on line 94) flagged by ruff but not fixed (pre-existing code).

7. **ProximityCalculator replicates Cell 4.13's return-value swap** — the
   notebook's `get_reference_city_v2` returns `round(dist_nairobi, 2)` as
   the third value (intended to be `dist_to_county_town_km`) when the county
   town is the reference.  B1 replicates this exactly so parity holds, but
   it's documented as a mismatch in `proximity.py`'s docstring.

## B2 — Prediction layer

8. **Model artifacts not present in the project** — `ARTIFACTS_DIR` contains
   only `README.md`.  All model files (`xgb_model.json`, `catboost_model.cbm`,
   `tabnet_model.zip`, `serving_manifest.json`, `preprocessing.json`,
   `conformal.json`, etc.) are git-ignored and must be copied in from
   Notebook 3's output.  The app runs in degraded mode without them.

9. **Parity validation deferred** — `scripts/parity_check.py` skips
   gracefully when artifacts are absent (exit 0, "artefacts not loaded —
   parity deferred").  The 99% pass-rate gate has not been run against real
   model files.

10. **`listings_scored.parquet` does not carry `size_acres` or `infra_*`
    columns** — Cell 9.2's prediction export carries `ID_COLUMNS` +
    per-model predictions but not the feature columns the parity check
    needs.  The parity script falls back to `exp(train_median_log)` acres
    and "all not sure" infrastructure.  If parity comes back below 99% on
    the `infrastructure_score` feature, the fix is in the notebook (extend
    `ID_COLUMNS` in Cell 9.2) — not in the backend.  Reported, not fixed.

11. **Pydantic v2 + FastAPI exception handler bug in B0** — when a
    `field_validator` raises `ValueError`, Pydantic v2 embeds the exception
    instance in `err["ctx"]["error"]`, which `json.dumps` can't serialise.
    Fixed in B2 by stringifying `ctx` values in `app/core/exceptions.py`'s
    validation handler.  Flagged at the time as a pre-existing B0 bug.

12. **`pyarrow` was missing from `requirements.txt`** and the latest pyarrow
    needs `numpy >= 2.0`, conflicting with the project's `numpy==1.26.4` pin.
    Fixed in B2 by adding `pyarrow==15.0.2`.  Flagged at the time.

13. **`from __future__ import annotations` removed from `predict.py` router**
    (B7) — slowapi's `@limiter.limit(...)` decorator wraps the function in a
    way that breaks Pydantic's forward-ref resolution when annotations are
    strings.  Documented in the file's header comment.

## B4 — Places + named POIs

14. **OSM place tag coverage in Kenya is uneven** — informal settlement
    names (e.g. "Mukuru kwa Reuben"), newly-developed suburbs, and estate
    names inside large cities are under-represented in OSM.  The gazetteer
    (`kenya_places.gpkg`) is NOT a curated administrative dataset — it's
    whatever the OSM community tagged.  Reported in B4's final reply.

15. **POI name fallback is approximate** — `"<category> near <nearest town>"`
    is a label, not a name.  The nearest town may be several km away and the
    POI may be more naturally associated with a different locality.
    **RESOLVED (frontend round):** The backend now sets `is_fallback=true`
    on `PredictNamedPOI` and `NamedPOIResult` for these labels (detected via
    `_is_fallback_name()` in `named_poi_index.py`), and the frontend
    (`NearbyInfrastructure.tsx`) renders them in lighter text with an
    "approximate" pill badge so users are not misled.  The underlying
    approximation itself (fallback names are labels, not real names) is
    unchanged — only the visual distinction was added.

16. **No deduplication of POIs** — OSM can have duplicate point+polygon
    features.  The extraction script converts polygons to centroids and
    concatenates, so near-identical entries may appear.  The BallTree query
    returns the nearest, so duplicates don't affect distance correctness.
    Reported in B4.

17. **Extraction scripts NOT run** — `scripts/extract_poi_names.py` and
    `scripts/download_county_boundaries.py` are ready to run but have not
    been executed (no PBF / network access in this environment).  The
    backend loads whatever GPKG files are present; when absent, endpoints
    return 503 `DATA_UNAVAILABLE`.

18. **Region subtitle is a coarse approximation** — "Nairobi Metropolitan —
    <place_type>" for places inside a bounding box; "Kenya — <place_type>"
    elsewhere.  A production version would point-in-polygon against the
    counties GPKG for the county name.  Reported in B4.

## B5 — Market Insights geospatial

19. **County boundaries simplified for rendering only** —
    `kenya_counties_simplified.geojson` (Douglas-Peucker, 0.005° tolerance)
    is for the choropleth, NOT for point-in-polygon.  B1's county lookup
    uses the full-resolution `kenya_counties.gpkg`.  The simplified file is
    a sibling artifact, not a replacement.  Reported in B5.

20. **`dist_to_nairobi_km` recomputed from lat/lon** — neither
    `listings_scored.parquet` nor `oof/test_predictions.parquet` carries
    the `dist_to_nairobi_km` column (it's a feature that didn't survive
    into the export).  The per-listing endpoint recomputes it via B1's
    haversine.  Reported in B5.

21. **Coverage thin for northern/northeastern counties** — the modelling
    frame has few listings in Marsabit, Turkana, Wajir, Mandera, Garissa.
    The scatter plot for those counties shows few or zero points.  Not
    fixed — reported as expected for a property-site scrape.

## B6 — Performance hardening

22. **Live SHAP per-request is in scope but not cached** — B6 measured
    ~7ms median / ~15ms first-call for the live-SHAP path.  No caching or
    async needed at current model sizes, but if the ensemble grows past
    ~500 trees per member or feature count past ~50, steady-state latency
    would climb to ~20–50ms.  The `latency_ms` field in the response lets
    the operator monitor.  Reported in B6.

23. **Per-listing SHAP lookup not built** — the precomputed
    `shap_values.parquet` covers only `df_model` rows (the modelling set),
    not arbitrary new map points.  A separate `/api/v1/listings/{listing_no}/shap`
    endpoint was proposed but not built.  Reported in B6.

## B7 — Rate limiting

24. **Single-replica limitation** — in-memory storage by default.  With 2+
    Railway replicas, each replica has its own counter — a client hitting N
    replicas gets N× the limit.  Set `REDIS_URL` before scaling horizontally.
    Reported in B7.

25. **Rate limit is a conservative starting point without production traffic
    data** — 20 req/min per IP.  Tune via `PREDICT_RATE_LIMIT_PER_MINUTE`.
    Reported in B7.

26. **`X-Forwarded-For` can be spoofed by the client** — Railway's proxy
    overwrites it on every inbound request, so in production the value is
    trustworthy.  In local dev / CI the header is absent and the fallback
    is used.  Not a security concern for rate limiting.  Reported in B7.

27. **Mypy error on `main.py:312`** — slowapi's `rate_limit_exceeded_handler`
    type signature doesn't match Starlette's expected `Callable` type.  The
    CI mypy step is lenient (`|| true`) so this doesn't fail the build.  Not
    fixed — a type-narrowing issue, not a runtime issue.

## B8 — Model versioning

28. **No automatic rollback-on-failure** — the validation gate
    (`make validate-version`) is on-demand and human-in-the-loop.  Auto-
    promotion without a human review was explicitly out of scope.  Reported
    in B8's ADR.

29. **No hot-reload** — changing `ACTIVE_MODEL_VERSION` requires a Railway
    redeploy (~30–60s).  Hot-reload was considered and rejected (complexity
    doesn't match the traffic pattern).  Reported in B8's ADR.

30. **Artifact disk usage grows with each version** — ~50–200 MB per model
    set.  Old versions are never deleted on promotion (by design — rollback).
    Clean up manually when disk pressure mounts; keep at least the previous
    one.  Reported in B8's ADR.

## B9 — Metrics

31. **No external dashboard wired** — `/metrics` is self-hosted Prometheus
    text format.  No SaaS APM dependency added.  The person decides whether
    to wire Railway's own metrics, Grafana, etc. on top later.  Reported in
    B9.

32. **`/metrics` route is `include_in_schema=False`** — it doesn't appear in
    the OpenAPI snapshot by design (it's a scrape endpoint, not an API
    contract the frontend consumes).  Reported in B9.

## B10 — OpenAPI snapshot

33. **All schema changes flagged equally** — additive (new optional field)
    and breaking (renamed/removed field) changes both fail the CI snapshot
    diff.  The point is visibility before merge, not auto-approval of "safe"
    changes.  The diff output shows what changed; the human decides which
    kind it is.  Reported in B10.

## Cross-phase

34. **No `.env` file shipped** — only `.env.example` with placeholder values.
    Real secrets must be injected via Railway's env var mechanism.  Confirmed
    in the delivery audit.

35. **`artifacts/` contains only `README.md`** — no model binaries, parquet
    files, or geo data shipped.  All large files are git-ignored per B0's
    rule.  Confirmed in the delivery audit.

36. **`frontend/` is a placeholder** — only `frontend/README.md` exists.
    The React frontend has not been built.  B0's scaffold intentionally
    left this as a stub.  **NOTE:** The full frontend (F0-F9) has since been
    built — see the "Frontend gaps" section below.  This entry is kept for
    historical context (the B0 scaffold's original state).

## Frontend round — resolved gaps

The following items were reported as gaps during F0-F9 and have now been
resolved in the frontend round (MapLibre + targeted gap fixes).  Each item
is marked RESOLVED with a description of what was done.

37. **Deal Finder export was page-only (F6)** — the export button only
    exported the currently loaded page.  **RESOLVED:** `csv-export.ts` now
    fetches all pages matching the current filters (page_size=200, looped)
    up to a 2000-row hard cap.  If the cap is hit, the UI shows
    "Export capped at 2000 rows (N total match the current filters)."
    The button label was updated to "Export (all)".

38. **Title Documentation field looked functional (F4)** — the
    unsupported-state panel had a live-looking `PillInput` for title
    documentation that silently did nothing on submit.  **RESOLVED:**
    The input is now disabled with a lock icon and an inline note:
    "Not yet supported — this field is for future use."  The `useState`
    hook for the field's value was removed.

39. **POI fallback names styled identically to real names (F4)** — POIs
    using B4's category-fallback naming (e.g. "hospital near Ruiru")
    rendered identically to real OSM names.  **RESOLVED:** The backend now
    adds an `is_fallback: bool` field to both `PredictNamedPOI` and
    `NamedPOIResult` (detected via `_is_fallback_name()` in
    `named_poi_index.py`, which checks if the name starts with
    `"<category> near "`).  The frontend renders fallback-named POIs in
    lighter text (`text-secondary`) with an "approximate" pill badge.

40. **MapLibre not implemented (F0/F4/F5/F6)** — all three map locations
    (Predictor pin-drop, Market Insights choropleth, Deal Finder nearby
    listings) were placeholders or colored div grids.  **RESOLVED:** All
    three now use real MapLibre GL maps with OSM raster tiles and
    "© OpenStreetMap contributors" attribution.  Bundle size impact:
    +1,114 kB raw / +305 kB gzip for the maplibre-gl chunk, +71 kB raw /
    +10 kB gzip for CSS.  Total JS increased from 237 kB to 550 kB gzip.
    This is a meaningful regression but is inherent to adding a full WebGL
    map library — the alternative (static tile images) would require a
    tile server and wouldn't support interactive pin-drag or polygon
    click-to-select.

## Frontend gaps (F0-F9) — reported, deliberately left as-is

These items were reported during the frontend build phases (F0-F9) and are
**deliberately left unchanged** — they are acceptable tradeoffs, not
oversights.  Each was explicitly called out in its phase's final reply and
is collected here so the next maintainer knows what was approximated.

41. **Web/mobile icon and path-naming mismatches (F0) — DECISION: keep
    per-breakpoint icons, document as deliberate.** Every shared nav item
    uses a different Material Symbol icon between the web and mobile designs
    (e.g. Overview: web `dashboard` vs mobile `analytics`; Predictor: web
    `calculate` vs mobile `neurology`; Market: web `trending_up` vs mobile
    `map`; Deals: web `local_offer` vs mobile `verified`). Path names were
    standardised on the web paths for React Router (`/predictor`,
    `/market-insights`, etc.); the mobile dock's shorter labels ("Predict",
    "Market", "Deals") are presentation-only and route to the same paths.

    **Re-examined in the visual-fidelity audit pass.** The decision is to
    KEEP the per-breakpoint icons (no change to behavior), for these reasons:

    1. **The mobile dock is a 5-item SUBSET of the web nav's 8 items**, with
       abbreviated labels. It is already a condensed/different information
       architecture, not a 1:1 port — so using its own icon set is
       consistent with the condensation.
    2. **The mobile "More" item (`menu`) has no single web-route counterpart**
       — it routes to `/more` which links to 6+ secondary screens. At least
       1 of 5 mobile dock items has no web equivalent at all.
    3. **Each device's icon set is internally self-consistent.** The web
       icons are the majority pattern across 9 of 10 web design screens
       (dashboard 6/9, calculate 8/9, trending_up 9/9, local_offer 4/9 tied
       with travel_explore, speed 6/9, lightbulb 5/9, table_chart 5/9,
       info 8/9 — only 12_data_review disagrees and it is a one-off
       outlier). The mobile icons are consistent across all mobile screens
       checked (m01_overview, m07_market_insights, m15_more all use
       analytics/neurology/map/verified/menu).
    4. **A user is on one device at a time** and never sees the other
       device's icon. The "switch devices and get confused" risk is
       theoretical and minor for the diaspora/institutional persona, who
       reads the text label, not just the icon glyph.
    5. **Overriding one design source's icons to match the other would
       violate that source's intent** for no functional gain.

    The decision and its rationale are documented in
    `frontend/src/app/nav-config.ts` above the `NAV_ITEMS` / `MOBILE_DOCK_ITEMS`
    declarations so it lives next to the code it governs. This entry is no
    longer an open question.

42. **Client-side-computed trend curve (F5)** — the Market Insights scatter
    plot's trend line is computed client-side via simple OLS linear
    regression on `log(price)` vs distance, because the backend
    (`/counties/{county}/listings`) returns only raw scatter points, not a
    fitted curve.  This stays client-side even after the MapLibre work —
    the backend does not return a fitted curve.  Reported in F5's final
    reply.

43. **TabNet shown as historical-only (F7)** — if TabNet appears in the
    metrics table, it is rendered greyed out with a footnote "historical
    reference only — may have been pruned from serving."  The backend's
    metrics table (Cell 9.3) includes all models that were trained, not
    just those that survived serving-manifest pruning.  Reported in F7's
    final reply — not silently omitted.

44. **Client-templated Plain Synthesis text (F8)** — the "Plain Synthesis"
    sentence in the Explainability screen is templated client-side from
    the driver list (e.g. "This estimate is primarily driven by [feature 1]
    (+X%), [feature 2] (-Y%), and [feature 3] (+Z%).").  The backend does
    NOT generate natural-language synthesis (B2 doesn't mention it).
    Reported in F8's final reply — the template logic is in
    `explainability/helpers.ts`.

45. **Fixed non-live exchange rate (F9)** — the KSh ↔ USD toggle uses a
    fixed rate of 1 USD = 129 KSh (approximate mid-market rate as of late
    2024).  This is NOT live/fetched — the person must update it manually
    or wire a real FX source.  The rate is a constant in
    `src/lib/currency/format.ts` and displayed in the Settings screen.
    Reported in F9's final reply.

46. **Untranslated Kiswahili technical terms (F9)** — the following terms
    are deliberately left in English in the Kiswahili locale because
    translating them would be confusing or awkward:
    - "Ensemble model" — no clean Kiswahili equivalent for "ensemble" in ML
    - "SHAP" — proper noun (SHapley Additive exPlanations)
    - "Conformal" — statistical term
    - "XGBoost" / "CatBoost" / "TabNet" — proper nouns (library names)
    - "KSh" — currency symbol
    - "Log scale" — "kipimo cha logi" would be confusing
    - "API" — universal technical term
    These are flagged in `src/lib/i18n/index.ts` with inline comments.
    Reported in F9's final reply.

47. **Data Explorer and About screens are placeholders (F0) — Data
    Explorer and About RESOLVED (P-fidelity round); Settings still
    PARTIAL** — the original F0 scaffolds have been replaced:
    - **Data Explorer (RESOLVED):** the full data-quality tab now matches
      09_data_explorer_quality + m12 — five-pill tab group with `?tab=`
      URL state (the other four tabs render "Coming soon" panels), four
      stat tiles, missing-values card (from /model/feature-evaluation,
      target row filtered out), log-scale price histogram with median
      pill + p1/p99 dashed lines (from the NEW
      `GET /api/v1/data/price-distribution` endpoint this round added —
      backend + schema + 5 tests + typed hook; OpenAPI snapshot
      regenerated), listings-per-county bars with threshold divider +
      hatched below-threshold rows, provenance card frame, county table
      with Model Ready / Not-enough-data pills + Download CSV +
      pagination, mobile listing-sample-record cards, and the
      real-version footer.
    - **About (RESOLVED):** built to m13_about — eyebrow pill, live-system
      card (green/amber dot, real model_version chip, data_date + usable
      count, three-stat footer), 6-step pipeline stepper with connecting
      line + design icons + STEP 06 • DEPLOYMENT highlight, 7 accessible
      accordion rows with API-derived numbers, mailto report button
      (VITE_REPORT_EMAIL-gated), full footer disclaimer.
    - **Settings (still PARTIAL, unchanged this round):** functional but
      not restyled against m15_more — the round's scope was Data Explorer
      + About, so the Settings visual pass remains open.

48. **Settings screen is mobile-only in the design (F9)** — the web design
    export does NOT include a settings screen.  Settings is reachable from
    the left rail's "Settings" button (desktop) and from the mobile "More"
    screen.  The Settings screen serves both breakpoints with the same
    content.  **Still open:** not yet restyled to m15_more's card/row
    language — see the PARTIAL note on #47 above.

49. **F7 missing endpoints for raw prediction points + error-by-support —
    RESOLVED** — the backend endpoints `GET /api/v1/model/predictions`
    (with `sample` param) and `GET /api/v1/model/error-by-support` were
    added in the backend round after F7 shipped placeholders.  The
    frontend's F7 Model Performance screen still uses the placeholder
    text for error-by-support ("Error by support data not available via
    API") because the frontend was not updated to consume the new
    endpoints after they were added.  The endpoints exist and are tested;
    the frontend wiring is a follow-up task.

50. **No dark mode (F1)** — confirmed: there is no dark mode anywhere in
    the design export.  `darkMode: 'class'` appears in the Tailwind config
    (a default) but zero `dark:` utility classes are used in any
    component.  No dark mode was added speculatively.  Reported in F1's
    final reply.

## G1 — Overview page visual-fidelity pass

51. **Overview page: design elements found but NOT built (G1)** — the
    following sections appear in `01_overview/code.html` (web design) but
    were never implemented in `src/features/overview/`. They are flagged
    for deliberate review, not silently added:

    a. **"Price by property type" bar chart** (Row 3, Card 2) — a vertical
       bar chart with hatched bars for Agricultural/Residential/Industrial
       and a solid highlighted bar for Commercial, plus a floating pill
       badge showing "KSh 6.2M" on the Commercial bar. Requires a new data
       source (median price per property type) that the Overview hooks
       don't currently fetch.

    b. **"Price by size band" line chart** (Row 3, Card 3) — a dual-line
       chart showing the national model curve (solid orange) vs a selected
       county benchmark (dashed near-black), with vertex markers at
       1/8¼½1-5-20+ acre breakpoints. Requires a size-band aggregation
       endpoint that doesn't exist.

    c. **Floating tooltip card on the price-by-distance chart** — the
       design shows a pinned tooltip "50–100 km corridor · Median KSh 1.8M
       · Range 0.9–3.2M · 74 lst" floating over the chart. The current
       chart has hover tooltips only (no pinned corridor annotation).

    d. **3 micro utility buttons on the price-by-distance card header**
       (refresh, calendar/quarterly filter, download/export) — the design
       has these in the card's top-right; the current card has none.

    e. **Anomaly flag note on the deal-signals card** — the design shows
       "12 listings flagged as possible data anomalies" with an
       `error_outline` icon in a surface-container-low pill at the bottom
       of the card. Requires a data-anomaly count from the backend's
       data-review endpoint, which the Overview page doesn't currently
       fetch.

    f. **Sync/refresh button on the deal-signals card header** — the
       design has a `sync` icon button in the card's top-right; the
       current card has none.

    g. **Mobile KPI hero card + 2x2 grid** — the mobile design
       (`01_mobile_overview`) uses a fundamentally different KPI layout:
       one large "hero" KPI card (National median per acre with show_chart
       icon + typical-range pill) followed by a 2x2 grid of compact metric
       tiles. The current app uses the same flat 2/3/5-column grid at all
       breakpoints. Implementing the mobile hero layout is a responsive
       design change that would require a separate mobile KpiRow variant.

    h. **Mobile "Filters (2)" button + removable filter chips** — the
       mobile design uses a single "Filters (2)" button that opens a
       filter sheet, plus removable active-filter chips ("County: Kiambu
       ×", "All property types ×"). The current app uses two separate
       PillDropdown components at all breakpoints.

    i. **"Live Feed" badge next to the mobile page title** — the mobile
       design shows a green-pulsing "Live Feed" pill badge next to
       "Overview"; the current app has no such indicator.

    j. **Disclaimer footer** — the mobile design has a footer reading
       "Statistical estimate, not an official valuation. Map data ©
       OpenStreetMap contributors. Ensemble model v1"; the current app has
       no page-level footer.

52. **Overview page: trend-line shape (G1)** — the design's
    price-by-distance chart shows a hand-drawn cubic Bezier CURVE as the
    trend line; the current implementation uses an OLS-fitted STRAIGHT
    line (on a log-scale Y axis, this represents exponential decay —
    `price = a·e^(-b·distance)`). The straight line is the statistically
    correct fit for real data; the design's curve is an aesthetic mockup.
    Not changed — the OLS approach is correct for real data and is the
    same computation Market Insights uses (`computeLogTrend` in
    `market-insights/helpers.ts`).

53. **Overview page: scatter vs median-per-band (G1)** — the design's
    chart plots a few MEDIAN points (one per distance band) connected by
    the trend curve; the current implementation plots ALL individual
    listings as scatter dots. The scatter approach is more informative
    (shows the actual data cloud and outliers) and is what a real
    analytics dashboard would show. Not changed — switching to
    median-per-band would reduce information density.

54. **Haversine consistency: VERIFIED (G1)** — the Overview page's
    client-side `haversineKm` (`overview-helpers.ts`) and the backend's
    `haversine_km` (`landval/features/geo.py`) produce IDENTICAL results
    (max diff 2.84e-13 km across 11 test points spanning 0–446 km from
    Nairobi — floating-point noise). Both use R=6371.0, the same formula
    (`R·2·atan2(√a, √(1-a))`), and the same Nairobi reference point
    (-1.2921, 36.8219). The only divergence is the backend's `round(x, 2)`
    before storing in the parquet/export (≤0.005 km / 5 metres rounding
    error — invisible on a scatter chart). Market Insights reads the
    backend's `dist_to_nairobi_km` column directly (not a client-side
    haversine), so the two pages agree to within rounding precision.
    **Caveat:** the backend reads the reference point from
    `scoring_params.json` (`ref.get("latitude", -1.2921)`) — if that file
    overrides the default, the backend would use a different point. With
    the shipped default, they match exactly.

## G2 — Predictor page visual-fidelity pass

55. **Predictor page: design elements found but NOT built (G2)** — the
    following elements appear in the predictor design code.html files but
    were not implemented. Flagged for deliberate review, not silently added:

    a. **3 micro utility buttons on the estimate card header**
       (02_predictor_reliable) — download (PDF appraisal), share, bookmark.
       The current estimate card has none.

    b. **"Overall net adjustment" summary** at the bottom of the drivers
       card (02_predictor_reliable) — shows the net sum of all driver
       effects (e.g. "+17%") with a "View explainability details →" link.
       The current DriversList doesn't compute or display a net summary.

    c. **"View explainability details →" link** — navigates to the
       Explainability screen with the current prediction's context. Not
       wired.

    d. **"Browse available data →" button on the unsupported state**
       (04_predictor_unsupported) — would navigate to Deal Finder or
       Overview. Not wired.

    e. **Score rings card on the unsupported state** (04_unsupported) —
       the design shows a "Nearby & Infrastructure" card with score rings
       even when the prediction is unsupported. The current
       UnsupportedPanel doesn't render NearbyInfrastructure (the result
       panel returns early before reaching that section).

    f. **Location search "recent" suggestions** (02_predictor_reliable) —
       the design shows a `history` icon next to previously-searched
       locations. The backend's `/places/search` endpoint doesn't track
       recent searches, so this concept isn't implemented. The current
       search shows all matching results without a "recent" distinction.

    g. **Selected-result check icon** (02_predictor_reliable) — the design
       shows a `check_circle` icon next to the currently-selected place in
       the search results. The current implementation doesn't mark the
       selected result (it advances to Step 2 immediately on pick).

56. **Predictor: deriveResultState bug FIXED (G2)** — the previous logic
    checked `county_listings === 0` to determine the "unsupported" state.
    But the design's 04_unsupported state has `county_listings = 2` (below
    the threshold of 10, but not zero). The correct trigger is
    `nearby_listings === 0` — when there are ZERO listings within the
    search radius, the estimate is meaningless. Fixed to:
    `if (coverage.nearby_listings > 0) return 'limited'; return 'unsupported';`
    This correctly handles the design's three states:
    - reliable: is_low_support=false
    - limited: is_low_support=true, nearby_listings>0 (e.g. 4 nearby)
    - unsupported: is_low_support=true, nearby_listings=0

57. **Predictor: driver list colors FIXED (G2)** — the previous
    implementation used green (market-opportunity) for price-increasing
    drivers and red (market-overvalued) for price-decreasing. The design
    (02_predictor_reliable) uses orange (primary-container #E8742A) for
    positive and tempered slate (#6B7A90 / market-neutral) for negative —
    a more analytical, less judgmental convention. Fixed to match the
    design. Negative driver labels also shift to `text-secondary` (lighter)
    per the design.

58. **Predictor: confidence interval visualization ADDED (G2)** — the
    design has a dedicated confidence-interval card with Low/Median/High
    labels, a gradient bar, and a position marker dot showing where the
    estimate sits within the range. F3 shipped only a text line
    ("80% range: KSh X – Y"). Added the full visual bar plus the
    asymmetric percentage range computation:
      low_pct  = round((low  - estimate) / estimate × 100)  ≤ 0
      high_pct = round((high - estimate) / estimate × 100)  ≥ 0
    Verified correct: reliable state produces "about -41% to +75%"
    (matching the design's "-41% to +75%"), limited state produces
    "about -62% to +144%" (matching the design's "-60% to +140%").

59. **Predictor: score ring colors FIXED (G2)** — all three ScoreRings
    previously used the same orange (#E8742A). The design uses different
    colors per ring: Amenities=primary-container (#E8742A), Accessibility
    =primary (#9D4400), Infrastructure=#E3A008 (market-caution amber).
    Added a `color` prop to ScoreRing and pass per-ring colors from
    NearbyInfrastructure. Also wrapped each ring in a
    `bg-surface-container-low p-2 rounded-xl` tile matching the design.

60. **Predictor: unsupported state enriched (G2)** — the previous
    UnsupportedPanel was just an EmptyState + disabled title-doc field.
    Updated to match the design's richer card with: an icon circle +
    "Sample Threshold Unmet" pill, a headline ("We don't have enough
    listings here to estimate a price"), diagnostic body text using
    coverage data (min_county_n, min_nearby_n, county_listings,
    nearby_listings, radius_km), and a diagnostic footnote. The disabled
    Title Documentation field (F10's fix) is kept below the diagnostic
    card.

61. **Predictor: limited state banner FIXED (G2)** — updated the
    limited-state warning banner to match the design's wording: "Sparse
    listing cluster: Only N listings nearby, so this range is wide."
    (was: "Limited data — Only X county listings · Y nearby"). The
    design's wording is more specific about WHY the range is wide.

## G3 — Market Insights page visual-fidelity pass

62. **Market Insights: MapLibre status CONFIRMED INTACT (G3)** — F10's
    MapLibre work is fully present and functional. `CountyPriceGrid.tsx`
    uses the shared `MapLibreMap` wrapper with real OSM raster tiles
    (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), renders GeoJSON
    polygons from `/api/v1/counties/boundaries` as a `Source` + `Layer`
    (fill + line), and supports click-to-select via `interactiveLayerIds`
    + `onMapClick`. The index.tsx file-level docstring was stale (still
    said "NOT MapLibre — just styled boxes by band") — updated to reflect
    the actual MapLibre implementation. VLM confirmed: "real map with OSM
    tiles, visible © OpenStreetMap contributors attribution."

63. **Market Insights: choropleth color scale FIXED (G3)** — the previous
    `bandForMedian` function used a multi-hue scale (green for <1.5M, blue
    for 1.5-3M, amber for 3-6M, orange for 6-12M, red for >12M). The design
    (05_market_insights/code.html) uses a SINGLE-HUE orange scale:
    #ffdbca → #ffb68f → #e8742a → #b34c05 → #6b2c00. Added a new
    `bandForMedianOrange` function that returns the design's orange scale,
    and updated both `CountyPriceGrid` (choropleth fill) and
    `CountyRankList` (whisker bar fills) to use it. The original
    `bandForMedian` is kept for backwards compatibility (not used by Market
    Insights anymore). VLM confirmed: "Orange tones only, in a
    dark-to-light gradient by rank."

64. **Market Insights: ranked list REWRITTEN (G3)** — the previous
    `CountyRankList` showed two side-by-side columns (Highest/Lowest) with
    just a colored dot + name + price. The design uses a TOGGLE between
    Top 10 / Bottom 10 with whisker/IQR bars per row. Rewritten to match:
    - Pill toggle with "Top 10 counties" (active: bg #1F1511) / "Bottom 10
      counties" (inactive)
    - Each row has a whisker/IQR bar: colored fill proportional to the
      county's median (relative to max median in set) + IQR overlay
      showing the Q1–Q3 range position. Computed from the same
      `CountySummaryRow` fields as the deep-dive panel, so the numbers are
      internally consistent.
    - Rank number, county name, listing count, median price per row
    - Selected county highlighted with `bg-primary-fixed/30` + "Selected"
      badge

65. **Market Insights: Deal Finder pre-filter WIRED (G3)** — the "See
    listings in Deal Finder" button previously did `navigate('/deal-finder')`
    with no county context. Now passes the selected county via URL query
    param: `navigate('/deal-finder?county=Nairobi')`. The Deal Finder
    reads this on initial load via `useSearchParams()` and sets the
    initial county filter state. The `useListingsScored` query then
    filters by that county from the first render. (The dropdown label
    shows the generic "County" until the county options load from
    `useCountyRowCounts`, but the data filtering is correct from the
    start.)

66. **Market Insights: trend-line minimum-points guard ADDED (G3)** —
    the PriceDistanceScatter's OLS trend line was shown for any scatter
    with ≥2 points. For counties with 2-4 listings, the regression line is
    noisy and misleading (a 2-3 point scatter produces a near-perfect fit
    that doesn't reflect any real price-distance relationship). Added a
    `TREND_MIN_POINTS = 5` guard: the trend line is only shown when
    `points.length >= 5`. When there are 1-4 points, a note appears
    instead: "Trend line hidden — too few listings (N) for a reliable fit."

67. **Market Insights: design elements found but NOT built (G3)** — the
    following appear in 05_market_insights/code.html but were not
    implemented. Flagged for deliberate review:

    a. **"Methodology & Scope" right-column card** — the design's right
       column (4 cols) is a methodology card with model reliability stats,
       national benchmark, and active coverage progress bar. The current
       app uses this column for the county deep-dive panel instead. The
       deep-dive panel is useful functionality not in the design; the
       methodology card is a design element not built.

    b. **"Size band" filter dropdown** — the design has a second filter
       for parcel size band alongside the property-type filter. The
       current app only has the property-type filter (which is itself a
       placeholder — the backend's `/counties/summary` doesn't support
       prop_type filtering).

    c. **"Median price / Listings" view toggle** — the design has a
       two-button toggle to switch the map coloring between median-price
       bands and listing-count density. Not implemented.

    d. **Map zoom controls** — the design has zoom in/out/center buttons
       in the map card header. MapLibre's default scroll/pinch zoom is
       present, but the explicit button controls are not.

    e. **Insufficient-data hatch pattern on map** — the design uses a
       diagonal hatch pattern for counties with <10 listings (shown as
       hatched grey polygons). The current map uses a flat grey fill
       (`NO_DATA_COLOR = '#eae1d9'`) for counties absent from the summary,
       but doesn't distinguish "no data" from "insufficient data (<10
       listings)" — both show as the same grey.

    f. **Property-type/size-band filters don't refilter** — the
       property-type filter is a placeholder (state is captured but not
       passed to any query). The backend's `/counties/summary` endpoint
       doesn't support prop_type filtering, so wiring this would require
       either a backend change or a client-side post-filter. Not changed
       — would require a backend contract change.

68. **Market Insights: map performance observation (G3)** — the GeoJSON
    payload uses the simplified boundaries file
    (`kenya_counties_simplified.geojson`, Douglas-Peucker 0.005° tolerance,
    per B5/B6). At this simplification level, the map renders smoothly
    with no noticeable chunkiness on pan/zoom. The 47-county polygon set
    is small enough that MapLibre handles it without frame drops on a
    standard desktop. No performance issue observed.

## P4 — Deal Finder page visual-fidelity pass

69. **Deal Finder: corpus summary card ADDED (P4)** — the design has a
    three-segment proportion bar with Underpriced/Fairly priced/Overpriced
    counts and percentages for the whole assessed corpus. The previous
    implementation had no corpus summary at all. Added a `CorpusSummary`
    component that makes 3 parallel `useListingsScored` calls (one per
    verdict, page_size=1) to fetch the REAL whole-corpus verdict counts
    for the current filter set. The counts update when filters change.

70. **Deal Finder: header eyebrow + export count FIXED (P4)** — added
    the "Market Arbitrage & Opportunity" eyebrow label with a local_offer
    icon per the design. The export button now shows the real filtered
    count: "Export N Deals" (was "Export (all)"). The count comes from
    the corpus summary's total.

71. **Deal Finder: table columns + verdict chips + Notice column FIXED
    (P4)** — column set updated to match the design: Listing & Location,
    Size, Asking / ac (with Total price subtitle), Model estimate (with
    80% range subtitle), Verdict (chip with percentage like "-28%
    Under"), Notice (warning icon for data_quality_flag, em-dash
    otherwise). Selected row now has a leading orange dot
    (`bg-primary-container ring-4 ring-primary-fixed/40`). Added
    `table-fixed` layout with explicit `<colgroup>` widths to prevent
    column clipping. Added `formatCompactMoney()` to the shared currency
    module for compact "KSh 3.4M" formatting in tight table cells.

72. **Deal Finder: filters expanded (P4)** — added three new filter
    controls that were in the design but not wired:
    - "Near amenity" chips (School/Hospital/Tarmac road) with 1/3/5 km
      segmented control — wired to the backend's `near_amenity` and
      `radius_km` params.
    - "Hide possible data errors" toggle — wired to the backend's
      `data_quality_flag` param.
    - "Reset filters" button — resets all filter state.
    Verdict chips restyled to match the design's active/inactive states
    with check_circle icons.

73. **Deal Finder: detail panel enriched (P4)** — added "Active Target
    Deal" eyebrow label, improved the "Model 80% Range Visualizer"
    styling (shaded band with label text, model median marker, asking
    price marker with dark label pill), and made the "Open original
    listing" button dark (`bg-[#1F1511]`) per the design. The panel now
    shows in a 5-column grid alongside the 7-column table (was full-
    width below the table).

74. **Deal Finder: pagination improved (P4)** — footer text now shows
    "Showing X-Y of N deals" (or "N underpriced deals" when a verdict
    filter is active) per the design's format.

75. **Deal Finder: methodology note + footer disclaimer ADDED (P4)** —
    static text at the bottom of the page explaining the verdict
    methodology (80% conformal interval) and attribution.

76. **Deal Finder: design elements found but NOT built (P4)** — the
    following appear in 06_deal_finder/code.html but were not implemented.
    Flagged for deliberate review:

    a. **"Saved Filters (n)" button** — the design shows a "Saved Filters
       (2)" button in the header. No saved-filters feature exists in the
       app (would need localStorage persistence + a UI to manage saved
       filter sets). The button is rendered but non-functional.

    b. **"Asking per acre" range filter** — the design has a price-range
       dropdown ("KSh 1.5M - 12.0M"). The backend's
       `ListingsScoredFilters` has no price-range param. Would need a
       backend change.

    c. **"Size" range filter** — the design has a size-range dropdown
       ("All sizes (0.25 - 50 ac)"). The backend has no size-range param.

    d. **"Top 3 Price Drivers" in detail panel** — the design shows 3
       driver bars in the detail panel. The scored-listings endpoint
       does not return per-listing SHAP drivers. Would need a separate
       per-listing SHAP endpoint (known-gap #23).

    e. **"Model Transparency" note** — the design has a note about model
       transparency. Not added because the design's wording references
       "drivers" which don't exist in the scored-listings response.

    f. **Map "Kiambu Metro Focus" chip** — the design shows a county-
       focus chip overlay on the map. Not added (would need a label
       derived from the selected county).

    g. **Map zoom/locate button controls** — the design has explicit
       zoom in/out/center buttons in the map card header. MapLibre's
       default scroll/pinch zoom is present, but the explicit button
       controls are not.

    h. **Map "Selected: KSh 4.8M/ac" label** — the design shows a
       floating label on the selected marker showing its price. Not
       added (the DealMap component shows the selected listing's label
       in the card subtitle, not as a floating map overlay).

    i. **Mobile list-card layout** — the design (m08_deal_finder) uses
       list cards instead of a wide table on mobile. The current app
       uses the same table at all breakpoints (with horizontal scroll).
       This is a significant layout change that would need a separate
       mobile ResultsTable variant.

    j. **Mobile filters bottom sheet** — the design (m09_deal_finder_filters)
       uses a bottom-sheet interaction for filters on mobile. The current
       app shows the filters inline at all breakpoints.

77. **Deal Finder: design-vs-backend discrepancy — verdict thresholds
    (P4)** — the design's corpus summary tiles say "> 15% below estimate"
    and "> 15% above estimate" for Underpriced/Overpriced. This is
    INCONSISTENT with the backend's actual verdict logic, which uses the
    80% conformal interval bounds (not a fixed 15% threshold). The
    design's own methodology note says "below the lower 80% bound" which
    IS correct. Decision: use the backend truth (conformal interval) and
    omit the misleading "> 15%" threshold labels. The methodology footer
    explains the actual logic.

## P5 — Model Performance page visual-fidelity pass

78. **Model Performance: /model/predictions + /model/error-by-support
    endpoints WIRED (#49 RESOLVED, P5)** — the backend already exposed
    `GET /api/v1/model/predictions` (with `sample` param) and
    `GET /api/v1/model/error-by-support`, but the frontend showed
    placeholder text "Error by support data not available via API" and
    had no actual-vs-predicted scatter. Added:
    - TypeScript types: `PredictionRow`, `ModelPredictionsResponse`,
      `ErrorBySupportRow`, `ErrorBySupportResponse` in types.ts (field
      names verified verbatim from backend/app/schemas/predictions.py)
    - Hooks: `useModelPredictions(sample=500)`, `useErrorBySupport()`
      in hooks.ts
    - `ActualVsPredicted.tsx` component: log-log scatter (OOF=orange,
      Test=green), 1:1 parity dashed line, +/-30% hatched band (reuses
      P1's diagonal-hatch `<defs><pattern>` approach), axis ticks at
      1M/5M/10M/20M KSh, sample-size indicator
    - `ErrorBySupportBars.tsx` component: 5 support buckets, hatched
      sparse bucket (<5 listings), error percentage labels
    - Replaced placeholder text in index.tsx with real components
    Confirmed in render: mock data shaped from backend schemas flows
    through correctly. Sample size of 500 chosen for scatter density.

79. **Model Performance: Explainability crash FIXED (P5)** — the
    Explainability page crashed with `TypeError: Cannot read properties
    of undefined (reading 'toLowerCase')` because `ShapGlobalRow.model`
    was accessed without a null guard. Fixed by simplifying the filter
    to `r.model === 'xgb'` (the backend always sends lowercase model
    names, so the case-insensitive `toLowerCase()` fallback was
    unnecessary and unsafe).

80. **Model Performance: design elements found but NOT built (P5)** —
    the following appear in 07_model_performance/code.html but were not
    implemented. Flagged for deliberate review:

    a. **Header eyebrow "BENCHMARK VALIDATED"** — the design has an
       eyebrow label above the title. Not added.
    b. **"Original 9 features / Selected features" toggle** — the design
       has a feature-set toggle. `useFeatureEvaluation` exists but the
       toggle isn't wired. The backend's feature-evaluation endpoint
       returns the ranked_table which may or may not support the
       original-vs-selected split.
    c. **"Test set: N listings" pill** — design shows a test-set-size
       pill in the header. Not added.
    d. **KPI chips** — design has "95% interval" chip, "Strong fit" tag,
       "Target: 80%" chip on the KPI row. These qualitative tags need
       explicit thresholds (e.g. R² > 0.85 = "Strong fit", coverage
       0.78-0.82 = "Well calibrated"). Not added — thresholds need
       documentation.
    e. **Model comparison Error/R² toggle** — design has a toggle
       between error and R² views. Current shows only RMSE bars.
    f. **Hatched Baseline bar in model comparison** — design shows a
       hatched bar for the baseline model. Not added.
    g. **Residuals histogram** — design has a residuals histogram with
       zero-bias line, "median -1.2%" label, and "Symmetric" badge. Not
       built — would need the prediction data (already available via
       /model/predictions) to compute residuals.
    h. **"Do ranges hold?" calibration labels** — design has "Well
       calibrated", "Optimal calibration", "Conservative bounds" labels.
       Current shows the bars without qualitative labels. Thresholds
       need documentation.
    i. **Closing caution banner** — design has a caution banner at the
       bottom. Not added.
    j. **"Methodology Paper" button** — design has a button linking to
       a methodology document. No document exists to link to.

81. **Explainability: design elements found but NOT built (P6)** — the
    following appear in 08_explainability/code.html but were not
    implemented:

    a. **"How one factor moves the price" dependence scatter** — the
       design shows a scatter with a fitted curve and highlighted
       current listing. The API does not return dependence/partial-
       dependence points. Would need a new backend endpoint.
    b. **"Pattern across all listings" SHAP beeswarm** — the design
       shows a beeswarm plot (rows per feature, colour = feature value).
       Recharts cannot do this natively; the API returns only
       `mean_abs_shap` (global summary), not per-listing SHAP values.
       Would need a new endpoint + custom SVG.
    c. **"Why this estimate" waterfall** — the design shows a waterfall
       with baseline row, up/down arrows, and a result row. Per-listing
       SHAP drivers are only available from the /predict response (shown
       on the Predictor page), not from the explainability endpoint.
       The "One estimate" mode currently shows a placeholder prompting
       the user to select a listing.
    d. **"In plain words" synthesis** — the current implementation has
       a simpler "Plain synthesis" card that templates a sentence from
       the top SHAP drivers. The design's "In plain words" card has
       richer wording. The current template is honest (no causal claims)
       but less detailed.
    e. **"All listings / One estimate" segmented switch** — built but
       the "One estimate" mode is a placeholder (no per-listing SHAP
       data source wired).
    f. **Listing selector dropdown** — the design has a dropdown for
       selecting a specific listing in "One estimate" mode. Not built.
    g. **Bottom caution banner** — "These patterns describe this data.
       They do not prove cause." Not added.
    h. **"Download technical documentation" link** — no document exists.
    i. **"SHAP TreeExplainer / Ensemble model v1" tags** — the design
       shows version tags. Not added (versions come from /meta).
    j. **Hatched lower bars in "What matters most"** — the design shows
       the first bar solid and the rest hatched. Current shows all bars
       solid orange.
    k. **"Tree models / Ensemble" switch** — the design has a toggle
       between tree-model and ensemble SHAP views. Not built.
    l. **"Cohort" chip** — the design shows a cohort filter chip. Not
       built.
    m. **"How much is explained" three-way split** — the design shows
       a three-way donut split (85/12/3: Tree-based / Linear spatial /
       Deep tabular). The API's `ensemble_shap_coverage` only has a
       two-way split (`tree_share_explained_by_shap` /
       `tabnet_share_not_covered`). Current shows the two-way split
       (85% Tree / 15% TabNet) which is what the API provides.

82. **Data Explorer / About / Settings: still placeholders (P7) —
    SUPERSEDED: Data Explorer + About were RESOLVED in the P-fidelity
    round (see updated #47); Settings remains PARTIAL.** The original
    P7 note (kept for history) said all three were placeholder stubs:
    - **Data Explorer** (`src/features/data-explorer/index.tsx`):
      renders "This is a placeholder for the Data Explorer screen."
      The design (09_data_explorer_quality) has 7+ cards (corpus stats,
      missing values, price distribution, listings per county, data
      sources, county table). This is a first build that needs a plan.
    - **About** (`src/features/about/index.tsx`): renders "This is a
      placeholder for the About screen." Only the mobile m13_about
      design exists (no web design). This is a first build.
    - **Settings** (`src/features/settings/index.tsx`): partially built
      (currency toggle, language, default county) but not styled against
      m15_more. The web export has no Settings design (#48).
    - **Data Review** (12_data_review / m14_data_review): a data-quality
      review workflow (flag queue, Fix & Accept / Keep As-Is / Exclude
      buttons, audit trail). NOT built — needs backend state (review
      decisions, audit log) that does not exist. Known-gaps #47
      mislabels this as the About design.

83. **Data Review: backend requirements (P7)** — the Data Review
    workflow (12_data_review) needs:
    - A `data_review` table/collection storing per-listing review
      decisions (listing_no, decision, reviewer, timestamp, notes)
    - API endpoints: GET /listings/review-queue, POST /listings/{id}/review
    - An audit trail log
    - The frontend would need: a review queue table, a detail panel with
      the listing's data + discrepancy info, action buttons, and an
      audit history view
    None of this backend infrastructure exists. Building the frontend
    with fake data is explicitly out of scope per the ground rules.


## P-fidelity round — Data Explorer + About (update to design)

84. **Data Explorer + About first-build provenance note** — this round was
    authored against a source tree where the prior "P7 first build" was
    NOT present (both folders were still the F0 placeholder stubs, and no
    data-explorer/helpers.ts existed), so this work IS the first build,
    shaped directly against the designs plus this update-to-design pass.
    All edits are confined to features/data-explorer/, features/about/,
    the new backend endpoint files, and the shared api layer (types.ts,
    hooks.ts) — so they can be reapplied onto a tree that already has a
    first build only after reconciling those two folders.

85. **Data Explorer: design elements still NOT built (reported, not
    added)**:
    a. **"Observed Corpus" raw count** — the raw pre-cleaning listing
       count does not exist anywhere the backend loads (the parquet holds
       only usable rows; manifest.json exposes only config /
       production_run / ensemble_shap_coverage). The tile renders with an
       honest "—" + "Not available yet". Exposing it would require the
       notebook export to carry the pre-cleaning row count.
    b. **Yield-rate percentage** — needs the raw collected count (see a);
       shows "needs the raw collected count — not available yet" instead
       of a fabricated 74.2%.
    c. **"Where the data comes from" provenance shares** (location
       accuracy / size source / price structure splits) — no source-tracking
       columns exist in the exported dataset. Card frame rendered with
       muted hatched bars + a "Not available yet" note per row. Building
       real shares would require the extractor to record per-listing
       provenance (a data-pipeline change, not an API change).
    d. **Extraction-pipeline version** — the design's "pipeline v2.1"
       number is not exposed by any backend field; the strip renders
       "Data extraction automated pipeline active" without a version.
       "View Spec" links to /about (the methodology sections).
    e. **The hand-written water-body sentence** in the missing-values
       callout — replaced by a data-generated callout ("<pct>% missing —
       <feature> is excluded from the primary ensemble models"), shown
       only when the worst feature is actually excluded.
    f. **Prices / Locations / Relationships / Table tabs** — no designs
       exist; they render "Coming soon" panels (tab state in the URL).
    g. **Mobile sample-record "Download CSV" button** — m12 shows a dark
       primary download button on the sample-records card; the app's CSV
       download lives on the (mobile summary) county card instead. Not
       added twice — reported as a minor mobile divergence.

86. **Data Explorer: design-vs-backend decisions**:
    a. **"47 Counties Tracked"** — rendered as the REAL number of counties
       the row-counts feed returns, not a hardcoded 47.
    b. **Threshold label "≥ 10 listings"** — uses the real
       /meta coverage.min_county_n (fallback 10 mirrors the backend
       default), not a hardcoded 10.
    c. **Table IQR format** — matched the design ("8.5M – 24.0M", no
       repeated KSh prefix).
    d. **feature-evaluation `missing_%` key** — the LIVE backend
       serialises `missing_%` (verified against a running app instance
       and the regenerated OpenAPI snapshot), even though the Pydantic
       field carries `alias="missing-%"`. The helper reads `missing_%`.

87. **About: design-vs-backend decisions + copy audit**:
    a. **"Cadastre Align: Geocoded"** (design third stat) — no backend
       field confirms cadastre alignment; SUBSTITUTED with the real
       "Counties Covered: N of 47" from /counties/row_counts.
    b. **"Last retrained 3 days ago"** — /meta exposes no training date;
       replaced with the real data_date ("Data as of DATE").
    c. **"v2.4 Production" / "Ensemble Engine v2.4"** — rendered from the
       real /meta model_version ("Ensemble model v1"), never hardcoded.
    d. **"Calibrated on 812 active parcels across urban & peri-urban
       growth corridors"** — the "growth corridors" claim is unverifiable;
       the sentence renders the real usable count only ("N scored parcels
       in the active dataset").
    e. **Pipeline step copy** — the design's Step 01 "daily ingestion",
       Step 03 "transit distance / road category", and the header's
       "geo-calibrated boundary appraisals" wording were trimmed to
       verifiable phrasing (no cadence claim, no "boundary appraisals").
    f. **"3 standard deviations" outlier claim** — replaced by the real
       flag definition (price outside the dataset's 1st–99th percentile
       window — mirrors the listings router's data_quality_flag filter).
    g. **Report button** — mailto: to VITE_REPORT_EMAIL only; hidden when
       the env var is unset (it is unset in this environment — the button
       is therefore not visible in the screenshots).
    h. **Glossary** — the four term definitions are real terminology;
       feature entries are built from the explainability payload's
       feature_labels (in_production_set only) rather than hand-typed.
    Claims the person must still confirm: the specific public real-estate
    platforms named in the design's data-sources copy (the app says only
    "public real estate listings"), and anything about ingestion cadence.

88. **About: reported design elements not built** — the "M13 About"
    design-file label (deliberately not rendered); a web-specific design
    (none exists — desktop is a sensible single-column extension).
