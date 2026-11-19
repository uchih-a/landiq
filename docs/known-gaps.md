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

44. **Client-templated Plain Synthesis text (F8) — PARTLY RESOLVED in P6b.**
    The "Plain Synthesis" sentence in the Explainability screen is still
    templated client-side from the driver list — the backend does NOT
    generate natural-language synthesis (B2 doesn't mention it).  P6b
    (#148) rewrote the wording honestly (mean |SHAP| is the average size
    of a feature's push on the predicted log price — NOT a "share of
    price variation"), moved it to i18n (en + sw, plural-safe 1/2/3+),
    and added the unit sentence.  A backend-generated synthesis remains
    a suggestion, not built.  The template helpers live in
    `explainability/helpers.ts` + the i18n keys `explain.synthesis.*`.

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

51. **Overview page: design elements found but NOT built (G1) — SUPERSEDED
    by the Overview build round (O1/O2, 2026-11-17).** The elements below
    were originally reported as "not built" by the G1 fidelity pass.
    The build round adds a new backend endpoint (`GET /overview/summary`)
    that owns every corpus-wide statistic the page shows, plus the
    frontend cards the design calls for.  Sub-item status (see #89–#97
    below for the build-round entries):

    a. **"Price by property type" bar chart** — RESOLVED (O2).  Three
       bars (Land / Farm / Commercial — the canonical types), hatched
       non-leader bars + solid orange leader with a floating value pill.
       Footer line from the response's `by_property_type.leader` /
       `leader_premium_pct`.
    b. **"Price by size band" line chart** — RESOLVED (O2).  National
       series (solid orange) + dashed near-black county series when a
       county filter is applied.  Vertex markers + low_support hollow
       bands.  No "+4%" chip — the design's reference for that percentage
       could not be derived from the data (reported as a decision).
    c. **Floating tooltip card on the price-by-distance chart** —
       RESOLVED (O2).  Pinned corridor annotation built from
       `by_distance_band` (median / q1 / q3 / n per band).
    d. **3 micro utility buttons on the price-by-distance card header** —
       PARTIALLY RESOLVED (O2).  Refresh (spinning state) and download
       (CSV of the plotted sample) are wired.  The calendar/quarterly
       filter is NOT built — listings carry no date field, so the button
       would be dead; reported in #96.
    e. **Anomaly flag note on the deal-signals card** — RESOLVED (O2).
       Reads `totals.n_flagged` from the overview response; pluralised
       correctly; hidden when 0; links to Deal Finder with the
       `data_quality_flag=true` filter applied.
    f. **Sync/refresh button on the deal-signals card header** —
       RESOLVED (O2).  Refetches the overview query.
    g. **Mobile KPI hero card + 2x2 grid** — RESOLVED (O2).  Hero card
       for national median per acre (with the All-Kenya/selected-county
       pill + middle-half chip), then a 2x2 grid of compact metric tiles
       (sample, coverage, typical error, range holds).
    h. **Mobile "Filters (n)" button + removable filter chips** —
       RESOLVED (O2).  Bottom sheet with the two selectors, plus
       removable chips under the header.
    i. **"Live Feed" badge next to the mobile page title** — RESOLVED
       (O2).  Shown only while `/health` reports `ok` (green pulse);
       amber degraded style otherwise.
    j. **Disclaimer footer** — RESOLVED (O2).  "Statistical estimate,
       not an official valuation.  Map data © OpenStreetMap
       contributors.  <model version from /meta>".

52. **Overview page: trend-line shape (G1)** — unchanged.  The design's
    cubic Bezier is an aesthetic mockup; the O2 implementation plots a
    STRAIGHT line from the response's `trend.slope` / `trend.intercept`
    (server-computed OLS log-linear fit), which is the statistically
    correct shape for `price = a · e^(-b · distance)` on a log-Y axis.

53. **Overview page: scatter vs median-per-band (G1)** — PARTIALLY
    changed.  The O2 implementation plots BOTH: the scatter dots from
    `scatter_sample` (the design's median points are insufficient — they
    hide the data cloud), AND an optional per-band median overlay
    (toggleable) that draws the `by_distance_band` medians as a separate
    line.  The scatter is the default view; the band overlay is the
    "Bands" toggle.

54. **Haversine consistency: VERIFIED (G1)** — unchanged.  The O1
    endpoint reuses the same shared `compute_distances_to_nairobi`
    helper the Counties router was refactored to use, so all three
    endpoints (Counties per-listing, Overview distance bands, model
    training) agree to floating-point precision.

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


## Overview build round (O1 / O2, 2026-11-17)

89. **O1 — `GET /api/v1/overview/summary` RESOLVED.** New read-only
    endpoint computes every corpus-wide statistic the Overview page
    shows, over the WHOLE usable frame already in memory (so the page
    stops deriving statistics from page 1 of `/listings/scored`, which
    is sorted most-underpriced-first and is therefore a biased sample).
    Files added:

    - `backend/app/schemas/overview.py` — Pydantic response schema +
      the canonical lists (`PROPERTY_TYPES`,
      `SIZE_BAND_EDGES_ACRES`, `DISTANCE_BAND_EDGES_KM`) that the
      frontend never re-types.
    - `backend/app/services/overview.py` — pure computation module
      (`compute_overview_summary`) so every number is unit-testable
      without HTTP.  Vectorised pandas/numpy; deterministic scatter
      sample (fixed seed, never `head()`).  No caching — the dataset
      is ~1k rows and the whole summary computes in single-digit ms.
    - `backend/app/api/v1/routers/overview.py` — router that loads the
      frame via `AppExportsRegistry.require`, validates `county` /
      `prop_type` against the data (422 with `allowed` list on
      unknown), and calls `compute_overview_summary`.
    - `backend/tests/test_overview.py` — 29 tests: happy path,
      filters, validation, band-edge semantics, hand-computed
      leader-premium / bulk-discount, deterministic + unbiased
      scatter sample (verified against a sorted-by-verdict frame),
      empty selection, degraded 503, unmapped prop_type counting,
      no-NaN-in-JSON.

    Files touched:

    - `backend/app/main.py` — registered the overview router.
    - `backend/app/api/v1/routers/counties.py` — refactored to use
      the shared `compute_distances_to_nairobi` helper instead of
      hard-coded `NAIROBI_LAT` / `NAIROBI_LON` constants.  The
      Counties and Overview endpoints now agree with each other and
      with the model's training feature (the helper reads
      `scoring_params.json` if present, else falls back to the
      canonical default).
    - `src/landval/features/geo.py` — added the canonical
      `NAIROBI_REFERENCE_LAT` / `NAIROBI_REFERENCE_LON` constants
      (single source of truth, no app dependencies so the shared
      library stays standalone).
    - `backend/app/services/geo_reference.py` — NEW backend service
      that reads `scoring_params.json` for the Nairobi reference and
      exposes the shared `compute_distances_to_nairobi` helper.
    - `docs/api.md` — added the endpoint section + a
      biased-sample warning on `/listings/scored`.
    - `docs/openapi.snapshot.json` — regenerated.

90. **O1 — canonical lists decision.** The endpoint owns three
    canonical lists and returns them in the response so the frontend
    never re-types them:

    - `PROPERTY_TYPES = ["Land", "Farm", "Commercial"]` — replaces the
      design's Agricultural / Residential / Commercial / Industrial
      labels (mock content).  Rows whose `prop_type` is not in this
      list are NOT silently dropped or relabelled — they are counted
      under `unmapped_prop_type_rows` and logged as a warning.
    - `SIZE_BAND_EDGES_ACRES = [0, 1/8, 1/4, 1/2, 1, 5, 20, +inf]` (7
      bands; the `+inf` tail is returned as `null` in JSON).  Labels:
      `["<1/8 ac", "1/8-1/4 ac", "1/4-1/2 ac", "1/2-1 ac", "1-5 ac",
      "5-20 ac", "20+ ac"]`.  Value on an edge goes to the UPPER band
      (the one whose lower edge equals the value) — documented.
    - `DISTANCE_BAND_EDGES_KM = [0, 25, 50, 100, 200, 400, +inf]` (6
      bands).  Labels: `["0-25 km", "25-50 km", "50-100 km",
      "100-200 km", "200-400 km", "400+ km"]`.

    The size-band scheme splits `[5, 20)` and `[20, +inf)` into two
    bands so the design's "5 Ac" and "20+ Ac" vertex labels each map
    to a distinct band.  If the person prefers 6 bands (merging
    [5, 20) and [20, +inf) into a single "20+ ac" band that covers
    [5, +inf)), the change is a one-line edit to the edges list +
    labels list.

91. **O1 — `min_county_n` threshold.** The `low_support` flag on size
    and distance bands uses the same `COVERAGE_MIN_COUNTY_N` value
    `/meta` reports (read from `coverage_rules.json` via the
    ArtifactRegistry).  When the coverage rules file is missing the
    threshold falls back to the manifest's documented default of 10
    — surfacing the same value `/meta` would return null, so the
    operator can see the threshold is unknown rather than silently
    hiding it.  If the person wants bands to use a different
    threshold (e.g. a per-band minimum of 5 rather than the
    per-county 10), that is a config change to surface in `/meta`.

92. **O1 — `n_counties_total`.** The total county count comes from
    the county boundaries service when loaded (the same service
    `/counties/boundaries` uses).  When boundaries are not loaded
    (degraded mode), the endpoint falls back to the count of
    distinct counties in the data — NOT a literal `47`.  The
    fallback is honest: it tells the user "we know about N
    counties" rather than asserting the constitutionally-defined
    count when the boundaries file isn't present.

93. **O2 — Overview frontend RESOLVED.** The Overview page is
    rebuilt against `useOverviewSummary(filters)`; every number on
    the page comes from the response (or from `/meta` / `/model/metrics`
    / `/health` for the few national fields the overview endpoint
    does not duplicate).  Removed client-side verdict-count /
    sample-median / OLS code (those are now backend-owned).  See
    the merge notes for the full file list.

94. **O2 — "Terra Kenya AI - v2.4" header text REMOVED.** The shell
    header previously displayed a hard-coded version string.  Now
    reads the real `model_version` from `/meta` (hidden when null)
    + the live date/time formatted with `Intl` from the browser
    clock.  No hard-coded "EAT" — the timezone abbreviation comes
    from the browser.

95. **O2 — permanent orange bell dot REMOVED.** The shell header's
    notifications icon previously always had an orange dot.  Now
    hidden unless driven by real state (no fake notification
    badges).

96. **O2 — calendar/quarterly filter button NOT BUILT.** The
    design's price-by-distance card header has three micro buttons
    (refresh, calendar, download).  The calendar/quarterly filter
    has no data behind it — `listings_scored.parquet` carries no
    date column.  Rendering a dead button would mislead the user.
    Not built; refresh + download are wired.

97. **O2 — "+4%" chip on size-band card NOT BUILT.** The design's
    Price-by-size-band card shows a green "+4%" chip next to the
    headline "KSh 3.4M" value.  The percentage's reference (vs.
    what baseline?) cannot be derived from the data the endpoint
    returns — it's mock content.  Omitted; the headline number is
    the median at the 1-acre band (the design's "1 Ac" vertex,
    documented in the card caption), and the chip is omitted
    rather than fabricating a percentage.

98. **O2 — "Nairobi Metro" comparison line NOT BUILT when no county
    selected.** The design's size-band card shows a dashed
    near-black "Nairobi Metro" line as the comparison series.  The
    endpoint returns a `comparison` series ONLY when a county filter
    is applied (without a county there is no defined comparison
    group).  Without a county selected, only the national series is
    drawn; the design's "Nairobi Metro" label is not fabricated.

99. **O2 — Deal Finder / Market Insights URL param integration.**
    Deal Finder reads `?county=&verdict=&prop_type=&flagged=` from
    the URL on first render (the anomaly-note link and the
    verdict-tile links use these).  Market Insights reads
    `?county=`.  Both keep their own state afterwards.  The
    `data_quality_flag` filter on the Deal Finder query type was
    already present (the listings router supports it); no schema
    change was needed.

100. **O2 — Predictor prefill.** The "Estimate a price" button on
     the Overview header passes the selected county to the Predictor
     via `?county=` ONLY if the Predictor already supports a
     prefill hook.  The current Predictor does not read URL params
     on mount, so the button navigates without a prefill for now —
     reported as a decision, not built.

101. **O2 — Vitest + React Testing Library added.** The frontend
     had no test runner before this round.  Added as devDependencies
     only (`vitest`, `@testing-library/react`, `jsdom`,
     `@testing-library/jest-dom`); the `npm run test` script runs
     them.  Unit-tests the pure helpers (formatters, URL filter
     parsing, CSV export, abbreviation, band-label mapping) and
     component-tests one card per state (loading / error / empty /
     data).  Kept small and fast.

102. **O2 — Kiswahili translations marked for review.** Every new
     Overview string was added to the i18n files in both `en` and
     `sw`.  Kiswahili translations I am not 100% sure of are marked
     with a `// TODO(sw): review` comment in `src/lib/i18n/sw.ts` —
     the person should review those before shipping.


## P2b — Price Predictor real-data wiring (2026-11-17)

103. **P2b — `GET /api/v1/predict/options` RESOLVED.** New read-only
     endpoint returning the canonical property-type list (Land/Farm/
     Commercial with per-type row counts), the parcel-size bounds
     (1st/99th percentile + median from the loaded frame), the default
     + allowed confidence levels, and the ten infrastructure checklist
     keys — all from the backend so the frontend never re-types them.
     Files: `backend/app/schemas/canonical.py` (shared constants),
     `backend/app/schemas/predict_options.py`, `backend/app/services/
     predict_options.py`, `backend/app/api/v1/routers/predict_options
     .py`, `backend/tests/test_predict_options.py` (18 tests).
     OpenAPI snapshot regenerated; docs/api.md updated.

104. **P2b — POST /predict prop_type validation RESOLVED.** The request
     now validates `prop_type` against the canonical list
     (case-insensitive, normalised to canonical casing).  Unknown
     values return 422 with `allowed` in details.  The model's
     preprocessor groups unseen categorical values into "Other" at
     transform time, so this validation does NOT change inference for
     the canonical three.  [backend-ready]

105. **P2b — PROP_TYPE_OPTIONS removed from frontend RESOLVED (A).**
     The predictor-helpers.ts `PROP_TYPE_OPTIONS` list (which included
     Residential, Industrial, Plot) is gone.  Pills now render from
     `usePredictOptions().property_types` — three only (Land/Farm/
     Commercial).  Default selection = first returned value.

106. **P2b — step captions + default confidence RESOLVED (B).** Step
     captions go through i18n with interpolation
     (`predictor.stepCaption` = "Step {{n}} of {{total}}").  The
     `DEFAULT_CONFIDENCE_LEVEL = 0.8` constant is gone — the default
     comes from `options.default_confidence_level`.  All "80% range"
     wording is built from `response.confidence_level`.

107. **P2b — size input bounds + validation RESOLVED (C).** The size
     input's min/max/step come from `options.size_acres` (1st/99th
     percentile).  The placeholder "1.5" is replaced with a templated
     hint derived from the median size.  Inline validation messages
     (empty, <=0, below/above range) are translated.  The button stays
     disabled with a visible reason.

108. **P2b — `#E3A008` inline hex replaced with design token RESOLVED
     (D).** The two inline `bg-[#E3A008]/10` / `text-[#E3A008]`
     references in PredictResult.tsx are replaced with
     `bg-market-caution/10` / `text-market-caution` (the token already
     exists in tailwind.config.ts).  The `#6B7A90` inline hex in
     DriversList.tsx is replaced with `bg-market-neutral` /
     `text-market-neutral`.  Remaining hex values in
     NearbyInfrastructure.tsx (`#E8742A`, `#9D4400`, `#E3A008`) are
     passed as the `color` prop to ScoreRing — the component's API
     takes a raw SVG stroke color (not a tailwind class); these mirror
     the tailwind tokens' values exactly.  Reported as a legit UI
     constant.

109. **P2b — Title Documentation field REMOVED RESOLVED (E).** The
     disabled "Title number / deed reference" input in the unsupported
     state is removed entirely.  It was frontend-only, never wired to
     the backend, and collected data that was discarded.  The
     `TITLE_DOC_KEY` sentinel is gone from predictor-helpers.ts.  The
     request body never includes a title key.

110. **P2b — i18n for all predictor strings RESOLVED (F).** Every
     user-visible string in the feature goes through i18n (en + sw).
     Parcel feature labels are keyed by the backend's key names
     (`predictor.feature.borehole` etc.).  Kiswahili translations
     marked `// TODO(sw): review` need native review.

111. **P2b — money honours KSh/USD toggle RESOLVED (G).** Every
     `formatMoney` call in the feature uses the currency-aware
     formatter from `@/lib/currency/format`.  The rate is config-driven
     (served via /meta's `fx` block from the O3 round).

112. **P2b — result-state logic from coverage only RESOLVED (H).**
     `deriveResultState` uses ONLY `coverage.is_low_support` and
     `coverage.nearby_listings` — no typed thresholds.  Every copy
     containing coverage numbers is templated from the response.

113. **P2b — canonical constants module created.** The canonical lists
     (`PROPERTY_TYPES`, `PARCEL_CHECKLIST_FIELDS`,
     `DEFAULT_CONFIDENCE_LEVEL`, `ALLOWED_CONFIDENCE_LEVELS`) now live
     in `backend/app/schemas/canonical.py` — the single source of truth
     shared between the Overview and Predict endpoints.  The Overview
     schema imports from there (the old duplicate definition in
     `overview.py` is removed).

114. **P2b — ScoreRing hex colors are legit UI constants.** The three
     hex values (`#E8742A`, `#9D4400`, `#E3A008`) passed to ScoreRing
     in NearbyInfrastructure.tsx mirror the tailwind tokens
     (`primary-container`, `primary`, `market-caution`).  ScoreRing's
     API takes a raw SVG stroke color (not a tailwind class), so these
     cannot be replaced with token references without refactoring the
     ScoreRing component.  Left as-is with a comment explaining the
     mapping.  [needs-decision: refactor ScoreRing to accept a token
     name?]

115. **P2b — Kiswahili parcel feature translations need native review.**
     The `predictor.feature.*` keys are marked `// TODO(sw): review` in
     the Kiswahili locale.  The person should review before shipping.


## P3b — Market Insights real-data round (2026-11-17)

116. **P3b — /counties/summary prop_type + data-driven bands RESOLVED
     (A, B, D).**  The property-type filter is real: an EXACT
     case-insensitive canonical match (unknown -> 422 with `allowed`);
     when set, per-county aggregates are recomputed on the filtered
     frame and the band edges (quintiles of the eligible counties'
     medians) are recomputed so the legend always matches the map.  The
     typed PRICE_BANDS thresholds (1.5M/3M/6M/12M) and their labels are
     gone — the frontend only maps a band INDEX to a colour token.
     min_county_n comes from the manifest config and is null +
     data_quality="min_county_n_missing" when absent (no typed 10).
     [backend-ready]

117. **P3b — /counties/{county}/distance-profile NEW RESOLVED (E).**
     Whole-county profile: n, ranges, server-side OLS trend, and a
     deterministic unbiased sample (fixed seed, never head() of a sorted
     frame — the frame IS sorted most-underpriced-first, so a page
     sample would be biased).  Low-support counties omit the trend.
     [backend-ready]

118. **P3b — rank-list display density (C).**  The list shows top N /
     bottom N where N=10 is a DISPLAY-DENSITY constant (a named UI
     constant with a comment — how many rows fit the card, not a data
     fact).  When eligible counties < 2*N the list splits at the
     midpoint so no county appears in both lists; the caption
     interpolates the count actually shown.  [architecture-decision: N
     is adjustable per breakpoint if the person wants]

119. **P3b — URL state + boundaries key (G, J) RESOLVED.**  ?county=&type=
     read on mount (invalid ignored) + written on change (replace for
     county clicks); the "See in Deal Finder" button passes both params.
     The boundaries payload's documented `properties.county` key (the
     same key the backend's own county_boundaries.py reads) is now the
     ONLY key the frontend reads — the six-key guessing is gone.

120. **P3b — Kiswahili + locale (F, H).**  Every Market Insights string
     is in i18n (en + sw; sw marked for native review); numbers go
     through the locale helper (no `toLocaleString('en-KE')`
     call-sites).  [needs-backend-work: none]

121. **P3b — design-vs-data discrepancy: the band-colour count.**  The
     design's legend shows FIVE orange steps; the response's bands are
     quintiles over the eligible counties, so with few counties the
     response may return FEWER bands (or none, with bands_reason).
     Decision: the frontend renders exactly the bands the response
     returns (fewer colours when data is thin) + a reason line — never
     inventing edges to fill five slots.  [architecture-decision]


## P4b — Deal Finder real-data round (2026-11-17)

122. **P4b — server-side sort + order param RESOLVED (A).**  The
     Best/Worst toggle now sends `sort` + `order` to /listings/scored
     and the client re-sort is deleted.  The backend sort is stable
     with a listing_no tiebreaker: page N+1 asc starts where page N asc
     ended; desc is the exact reverse of asc.  [backend-ready]

123. **P4b — substring -> exact filter semantics RESOLVED (B, D).**
     prop_type (canonical three) and county are now EXACT
     case-insensitive matches; unknown -> 422 with `allowed`.  This is
     a DOCUMENTED breaking change (docs/api.md); no frontend caller
     relied on substring behaviour (verified by search).

124. **P4b — /listings/options NEW RESOLVED (C, E, I).**  Every option
     list + limit the filters bar renders: property types, exact
     counties, verdicts with data-derived rules (basis = the
     conformal-interval comparison verified on the frame with
     match_rate; empirical ratio cut-offs), amenities + radii +
     availability, page sizes, sort keys, export cap.  PAGE_SIZE options
     and the default come from the backend.

125. **P4b — /listings/{listing_no}/nearby NEW RESOLVED (G).**  DealMap
     draws REAL haversine-nearest listings (self-excluded) from the
     endpoint; the old page-1-rows-as-"nearby" approach is deleted
     (MAX_SECONDARY_MARKERS is gone — the cap is the endpoint's limit).

126. **P4b — /listings/scored/export.csv NEW RESOLVED (H).**  Streaming
     server-side export: same filters + sort, UTF-8 BOM, raw KSh money
     columns, filter-built filename, truncation surfaced via
     X-Export-Truncated headers (cap only when LISTINGS_EXPORT_MAX_ROWS
     is configured).  The client page-walking EXPORT_ROW_CAP +
     window.alert are deleted.

127. **P4b — detail panel out-of-range RESOLVED (J).**  The predicted
     range visualizer no longer clamps the asking marker into the band
     (Math.max(1, ...) is gone): the asking price may fall outside —
     arrows + "asking is X% above/below the range" computed from the
     row's own low/high.  Missing or equal low/high renders an honest
     "range not available".

128. **P4b — URL state + selected-row clearing RESOLVED (L).**
     ?county=&type=&verdict=&flagged=&amenity=&radius=&sort=&order=&page=&size=
     read on mount (invalid ignored) + written on change; page clamps
     to 1 when it exceeds total_pages; the selected row clears when
     it's no longer in the result set.

129. **P4b — verdict hex colours (K) RESOLVED.**  One verdict-styles
     module (its own file, react-refresh-clean) holds the token map;
     ResultsTable chips, DealMap markers, and the detail panel chip all
     import it.

130. **P4b — verdict meaning explained RESOLVED (I).**  A help popover
     on each verdict chip shows the response's rule: the interval
     comparison basis, the empirical ratio cut-offs, and the match rate
     — all numbers from the response, no typed percentages.

131. **P4b — Kiswahili + locale (M) RESOLVED.**  All Deal Finder
     strings in i18n (en + sw; sw marked for native review); numbers
     via the locale helper; money via the currency-aware formatters.


## P5b — Model Performance real-data round (2026-11-17)

132. **P5b — error-by-support already wired (A) CONFIRMED + P5b
     enrichments.**  The P5 round wired GET /model/error-by-support;
     this round adds `band_order` (ascending ordinal per
     support_measure group so the UI never parses band strings) +
     `support_measures` with i18n label keys.  The band label is
     served verbatim from the notebook's export.  [backend-ready]

133. **P5b — log-scale CI unit bug RESOLVED (B).**  The tooltip's
     Math.round() on ~0.5 log-scale values (showing "0 - 1") is
     replaced with 3-decimal formatting; the axis is labelled "RMSE,
     log scale"; and a one-line plain-language note converts the
     chart's own RMSE to an approximate typical-miss % via exp(x)-1
     (the formula documented in metrics-helpers + the test suite).

134. **P5b — production-run row filtering RESOLVED (C).**  Only the
     production run's rows are charted (metrics_json.production_run);
     the card subtitle shows production_run_label from the response.

135. **P5b — interval levels from the response RESOLVED (D).**  The
     typed {level:'50% range', target:0.5} array is gone — the bars
     build from `interval_levels` (backend-derived from the artifact's
     interval_coverage_weighted_ensemble entries, else the populated
     coverage columns).  The KPI tile uses default_interval_level.

136. **P5b — ensemble row by name only RESOLVED (E).**  The backend
     returns `ensemble_model`; the frontend resolves the row by that
     value ONLY (substring + highest-weight fallbacks deleted; "not
     available" when absent).  Per-model display_name + family come
     from `model_info` (the neural-member grey styling keys off family,
     not a name substring).

137. **P5b — KPI copy + decimals RESOLVED (F).**  Tile labels build
     from response fields (ensemble display name, interval_method);
     percentages show ONE decimal; the "80% range hit rate" label is
     templated from default_interval_level.

138. **P5b — shared compact money formatter RESOLVED (G).**  The local
     formatCompactKSh is deleted; the MAE tile uses the shared
     formatCompactMoney (the KSh/USD toggle applies).

139. **P5b — n_test surfaced RESOLVED (H).**  The summary line shows
     "For N test listings…" from n_test (row count of the loaded
     test_predictions parquet); the MAE line is an i18n string with
     the shared formatter, hidden when null.

140. **P5b — weights decimals RESOLVED (K).**  EnsembleWeights shows
     one-decimal weights exactly as loaded; the "sums to 100%" line
     only renders when the exact sum equals 100% within rounding
     (never force-normalised).

141. **P5b — Kiswahili + locale (J) RESOLVED.**  All Model Performance
     strings in i18n (en + sw; sw marked for native review); chart tick
     values via the locale helper.

142. **P5b — sr-only tables fix.**  The a11y value tables are wrapped
     in sr-only divs (a bare sr-only table keeps its intrinsic width
     and overflowed mobile); verified 390 = 390 on mobile after the fix.

142b. **P5b — chart hex colours consolidated on the global tokens module
     (I final pass, 2026-11-18).**  The scattered `#e8742a` / `#6a5b56` / `#574238`
     / `#1f1b16` literals in `ActualVsPredicted.tsx`,
     `ModelComparison.tsx`, and `ErrorBySupportBars.tsx` are replaced
     by imports from the existing global `frontend/src/lib/ui/chart-tokens.ts`
     (introduced in P6b problem J).  Two new tokens added in this round:
     `CHART_COLOR_ON_SURFACE` (`#1f1b16`, mirrors tailwind `on-surface`)
     and `CHART_COLOR_TERTIARY` (`#006d3b`, mirrors tailwind `tertiary`).
     After this pass, `rg '#[0-9a-fA-F]{6}' frontend/src/features/model-performance/`
     returns ZERO matches outside the test fixtures.  [backend-ready]

## P6b — Explainability honest-coverage round (2026-11-18)

143. **P6b — coverage "recomputed" claim RESOLVED (A).**  The donut
     (and the old component comment) claimed the shares were
     "recomputed by the backend from the actually-loaded ensemble" —
     but /model/explainability served the notebook-time
     `manifest.json:ensemble_shap_coverage` verbatim.  Now the backend
     recomputes from the loaded registry's weights when it is up
     (`source: "recomputed"`, the ONE shared function
     `landval.modelling.coverage.shap_coverage_from_weights` — the same
     computation the registry method and the live /predict coverage
     block use, so the three surfaces cannot disagree), and falls back
     to the normalised manifest values with `source: "manifest"`.  The
     UI shows which source produced the numbers ("Computed from the
     loaded model." vs "From the training-time report.").  The shared
     function was extracted rather than duplicated: registry.py +
     explain.py + services/explainability.py all call it.

144. **P6b — donut unit-guessing + silent renormalisation RESOLVED (B).**
     The `> 1 ? /100 : x`, `Math.max(0.0001, sum)` and forced
     `100 - first` logic is deleted.  The backend serves fractions in
     [0,1] with documented keys; the frontend renders what it gets and
     shows an honest "Coverage not available" state when the shares are
     missing or do NOT sum to ~1 (tolerance = SHARES_SUM_TOLERANCE,
     a commented UI constant defined once).

145. **P6b — typed slice names RESOLVED (C).**  "Tree models (SHAP)" /
     "TabNet (not covered)" are gone; slice names build from
     `explained_members` / `unexplained_members` display names (via the
     payload's `models` list).  When the manifest path leaves members
     null, the wording makes no member claims ("Explained by SHAP").

146. **P6b — hard-wired model 'xgb' RESOLVED (D).**  GlobalShapBars /
     index never key off a member name.  The backend serves `models`
     [{key, display_name, family, ensemble_weight, has_shap}] ordered
     by weight + `default_model`; a selector renders only when >1
     SHAP-covered model exists (tabnet is in the list but never
     selectable); captions/empty states interpolate the selected
     model's display name.

147. **P6b — display density constants (E).**  TOP_N_BARS (10) and
     SYNTHESIS_TOP_N (5) are named, defined once, commented "display
     density, not a data fact"; captions interpolate the number
     actually shown ("Top {{n}} features…").

148. **P6b — honest synthesis wording RESOLVED (F).**  The old English
     sentence called mean |SHAP| a "share of price variation" — wrong.
     Rewritten: "the features that move the estimate most are A, B and
     C" + a plain unit sentence ("Bar length measures the average size
     of each feature's push on the predicted (log) price per acre… not
     a bigger share of the price").  i18n (en + sw), plural-safe
     templates for 1 / 2 / 3+ drivers.

149. **P6b — one-estimate mode is real RESOLVED (G).**
     [architecture-decision] The dead placeholder (and its false
     Deal-Finder promise) is replaced by a sessionStorage-backed
     last-estimate store (`src/lib/store/lastEstimate.ts`,
     useSyncExternalStore, try/catch around every storage access,
     cleared when the browser session ends).  The Predictor's mutation
     onSuccess saves the request + response + place name + timestamp;
     the mode renders DriversList (moved from features/predictor to
     src/components — a shared edit) + the live coverage block from the
     stored response's `explanation.coverage`; header = place name /
     size / property type / estimate time (all from the stored
     request/response).  Empty store -> honest empty state with a "Run
     an estimate" action to the Predictor.  DECISION FOR THE PERSON:
     if per-listing SHAP for arbitrary Deal-Finder listings is wanted,
     that needs a NEW backend route (see #158) — the store only replays
     the last /predict estimate.

150. **P6b — typical-price footer explained RESOLVED (H).**  The footer
     now says what the number IS ("Typical starting price per acre —
     the baseline the drivers push up or down from — is X."), hidden
     when `typical_price_per_acre_ksh` is null, formatted with the
     currency-aware formatter (verified: KSh 2,673,441 -> $20,724 with
     the /meta fx rate).  The backend computes it at load time from the
     explanation service's member base values (exp(sum w_m*base_m) —
     the same baseline /predict reports); null when unavailable.

151. **P6b — glossary limited to the model's features RESOLVED (I).**
     feature_labels.json carries the full Phase-3 catalogue (incl.
     in_production_set=false entries such as geocode_confidence); the
     panel now lists only features present in shap_global (the rows the
     bars chart) with the count interpolated ("The 8 features the model
     uses…").  Verified with a 9-label mock rendering 8.

152. **P6b — chart hexes tokenised RESOLVED (J).**  #e8742a / #6a5b56 /
     #574238 no longer appear in the feature; they live once in
     `src/lib/ui/chart-tokens.ts` (documented mirrors of the tailwind
     tokens) with `chartColorForFamily(family)` for member colours.
     Forbidden-literal grep of explainability/ is clean (matches only
     inside __tests__ mocks).

153. **P6b — i18n (K) RESOLVED.**  Every Explainability string
     (subtitle, captions, states, a11y labels, one-estimate mode) is in
     i18n en + sw (~45 new keys).  Kiswahili is machine-aided and NEEDS
     NATIVE REVIEW (same caveat as the P2b-P5b rounds; technical terms
     — SHAP, ensemble member names, log price — deliberately stay in
     English per the i18n header note).  Verified: sw locale renders.

154. **P6b — a11y.**  Mode toggle is a real segmented control
     (role=radiogroup + radios + ArrowLeft/ArrowRight); model selector
     is a radiogroup; both charts have accessible names (role=img +
     aria-label) plus sr-only value summaries (top features with
     values; coverage shares); colour is never the only encoding
     (legend labels + visible bar value labels; slice names + pcts).

155. **P6b — feature_importance unused (L) — suggestion, not built.**
     The backend still serves native + permutation importances for all
     three models; the design shows no such card, so nothing was built.
     Suggestion: a "feature importance (all models)" card or a
     comparison view if a design lands.

156. **P6b — backend additions.**  /model/explainability is additive:
     `models` / `default_model` / normalised `ensemble_shap_coverage`
     (with source) / `typical_price_per_acre_ksh` /
     `combined_base_value`; 13 new tests (test_model_p6b.py: both
     source paths, weight ordering, sum-in-tolerance, manifest percent
     normalisation, invalid-share null (never clamped), tabnet-only
     degenerate case, typical-price from the explanation service +
     failure -> null, 503 unchanged); docs/api.md + OpenAPI snapshot
     regenerated.  Backend: 300 passed / 1 skipped, ruff clean.

157. **P6b — render verification.**  Playwright at 1440 + 390 against
     the mocked API shaped from the REAL schemas (local Outfit +
     Material Symbols woff2 — agent-browser init scripts run at
     document-start where documentElement can be null; the font/style
     injection is now defensive or the whole init script silently
     aborts).  Captures: default, model selected, manifest vs
     recomputed, shares-invalid, error, empty, single-model (selector
     hidden), one-estimate with/without stored estimate, USD toggle,
     sw locale; mobile scrollWidth = 390 = innerWidth on every mobile
     capture.  The bars' unit sentence is a wrapping paragraph (an
     inside-SVG axis label clipped at 390px).  Frontend: typecheck +
     lint + build + 98 tests (19 new) pass.

158. **P6b — decisions for the person (numbered).**
     1. Should one-estimate mode eventually become a real per-listing
        SHAP endpoint (POST /listings/{listing_no}/explain)?  The store
        only replays the last /predict estimate; Deal-Finder listings
        have no per-listing SHAP (would need a new route + compute
        budget).
     2. Wording review of the plain explanations ("what moves the
        estimate most", "typical starting price per acre") — plain
        language for non-technical buyers, please sanity-check.
     3. Kiswahili native review (all sw keys added since P2b).
     4. The manifest-coverage fallback wording assumes a training-time
        report; confirm the manifest's ensemble_shap_coverage semantics
        against a real artifacts/ run (only synthetic manifests exist
        in this environment).

## P7b — Data Explorer: no hard-coded values, honest tabs, sourced thresholds (2026-11-18)

159. **P7b — threshold honesty (A) RESOLVED.**  `?? 10` is gone:
     the min-county listing threshold now comes from /meta's coverage
     block only, and when it is null the threshold badge, the
     threshold divider, the "Model Ready / Not enough data" statuses,
     and the ready/not-ready county split all disappear, replaced by
     "Threshold not available" captions (county table + coverage tile +
     listings-per-county subtitle).  The matching backend fix for
     /counties/summary was already landed by P3b
     (`min_county_n_from_manifest` returns null); /meta's inner
     `.get("COVERAGE_MIN_COUNTY_N", 10)` default remains OPEN (the
     documented B0-era allowlist item) — it only fires when
     coverage_rules.json exists but lacks the key.

160. **P7b — missing-severity threshold removed (B, option 2).**
     SEVERE_MISSING_PCT=50 (which features got the orange "severe"
     accent) was a typed data threshold with no configured backend
     notion of "too much missing", so the severity STYLING was removed
     (the brief's option 2): every row renders in the same plain style,
     the percentage stays `missing_pct` unmodified, sorting stays
     missing-desc, and the "excluded from the primary ensemble models"
     marker still comes from `in_selected_set`.  If the person wants a
     severity accent back, add a configured `missing_severe_pct` to
     /meta first (decision #6 below).

161. **P7b — tabs + honest placeholder (C) RESOLVED.**  Tab labels
     render from i18n (`de.tab.*`, en + sw).  The four undesigned tabs
     (Prices / Locations / Relationships / Table) render DISABLED,
     non-interactive-looking pills that stay reachable via `?tab=`,
     with a translated placeholder that names the data that would
     power each one.  The tab group is a proper tablist (role=tab,
     aria-selected, roving tabindex + arrow keys on enabled tabs).

162. **P7b — [architecture-decision] the four undesigned tabs (C).**
     Do NOT build them without designs.  What each would need:
     1. Prices — a new prices-by-group endpoint (per property type +
        size band; nothing serves group aggregates today; the closest
        existing data is /overview/summary's by_property_type /
        by_size_band blocks, which the Overview already renders).
     2. Locations — new location endpoints (map layers / place-level
        aggregates; /counties/boundaries + /places/search exist but
        serve no price-per-location aggregates).
     3. Relationships — a sampled scatter endpoint (unbiased, seeded,
        like /counties/{county}/distance-profile's sample — never
        first-N of the underpriced-sorted frame).
     4. Table — the RAW pre-cleaning dataset (the design implies
        ~1,094 rows) is NOT served anywhere; only the cleaned
        modelling frame is.  Exposing it means serving the raw scrape
        + row-count honesty ("usable listings" vs "raw listings" from
        the manifest — the raw count is not recorded in any artifact
        the backend loads).

163. **P7b — colour tokens + ramp constants (D) RESOLVED.**  The
     histogram ramp hexes (#dec1b3 / #ffb68f / #e8742a / #9d4400 /
     #8a7266) are single-sourced in `lib/ui/chart-tokens.ts`
     (CHART_COLOR_RAMP_* / CHART_COLOR_OUTLINE, each naming the
     tailwind token it mirrors) and the hatch gradients reference the
     tokens.  The ramp cut-offs live once in PRICE_RAMP_CUTOFFS with a
     "presentation constants, not data facts" comment.

164. **P7b — clamps kept as visual minimums only (E) RESOLVED.**
     Percentile markers use the response values (log10 position from
     the bin edges).  The three width clamps (bar 1.5% / divider 2% /
     missing-bar 2% minimums) are commented as VISUAL MINIMUMS; each
     row's count is printed as text so a clamp can never make a
     below-threshold county look bigger than its count.

165. **P7b — locale + currency (F) RESOLVED.**  `toLocaleString('en-KE')`
     call-sites were replaced by the `useFormatNumber()` locale helper
     (en-KE / sw-KE — one stray literal in Model Performance was swept
     too).  `compactKSh` (which ignored the KSh/USD toggle) was removed
     in favour of the shared currency-aware `formatCompactMoney`
     (format.ts, listed as a shared edit); the page subscribes via
     `useCurrency()` so a toggle/rate arrival re-renders the money.

166. **P7b — copy i18n + flag rule (G) RESOLVED.**  Every Data Explorer
     string is in i18n (en + sw, ~60 new `de.*` keys; sw is
     machine-aided and NEEDS NATIVE REVIEW).  The sanitization tile
     explains the flag from the response's `flag_definition`
     ("1st–99th percentile window" — ordinal-suffixed in code, numbers
     from the backend), never a typed "1st-99th".  "N = usable" and
     the flagged counts interpolate the real numbers.

167. **P7b — counts (H) RESOLVED.**  The County Coverage tile shows
     "of N counties" from /counties/summary's `n_counties_total`
     (boundaries response) — never a typed 47.  (About's "of 47" had
     the same fix, see #171.)

168. **P7b — missing-values card (I) verified.**  Sorting is
     missing_pct desc; the excluded marker comes from
     `in_selected_set`; feature names come from feature_labels (with
     the raw key as fallback); the percentage is `missing_pct`
     unmodified.  No change needed beyond (B)'s severity removal.

169. **P7b — CSV download (J) RESOLVED.**  BOM for Excel, RFC-4180
     quoted+escaped county names, plain locale-independent numbers,
     blank cells for null medians / unknown model_ready, and the
     filename carries the dataset date from /meta (never a typed
     date).  Unit-tested (header, escaping, numbers, honest blanks).

170. **P7b — states + a11y (K, L) RESOLVED.**  Every card has
     loading / error+retry / empty states and one query failing leaves
     the rest rendered (verified by test + render).  The tablist has
     roving tabindex + arrow keys; the county bars and the county
     table have sr-only text alternatives (county, count, status);
     the histogram has an sr-only summary (n, median, p10–p90);
     colour is never the only encoding (counts are printed text).
     Mobile scrollWidth = 390 = innerWidth on every mobile capture.

## P8b — About + Settings: data-driven copy, real options, FX from the backend (2026-11-18)

171. **P8b — About pipeline copy from APIs (A) RESOLVED.**  The
     pipeline steps render from the /meta `methodology` block
     (sources_note, cleaning_steps, feature_groups — one backend copy
     in `app/schemas/canonical.py`, every claim verifiable in the
     repo), the model names from /model/metrics `model_info`
     (tree+neural families; honest fallback copy when absent), and the
     interval level from `default_interval_level`.  UNVERIFIABLE
     claims were REMOVED, not templated: "duplicate listings" and
     "mismatched coordinates" exist only in the notebook's ETL, which
     is not part of this repo — the About page no longer states them.

172. **P8b — FAQ templated (B) RESOLVED.**  Reliability interpolates
     MedAPE (one decimal), the interval level, and the coverage at that
     level; the refusal answer interpolates the /meta thresholds and
     its fallback states no numbers; the anomalies answer interpolates
     `flag_definition`; the data-sources answer is the methodology
     sources_note.  No typed "80%" or "1st-99th" remains.

173. **P8b — glossary term unified (C) RESOLVED.**  "MdAPE" is gone;
     the app-wide term is "MedAPE" via i18n (`about.glossary.medape`
     matches model.methodLine's usage).  Glossary entries + the
     feature list render from i18n + feature_labels.

174. **P8b — About footer stats (D) RESOLVED.**  All four live-system
     stats come from the APIs (coverage at the response level, MedAPE,
     scored parcels, counties); "Counties Covered" shows "N of TOTAL"
     with TOTAL from /counties/summary `n_counties_total` — the typed
     47 is gone.  Each stat shows "not available" when null.

175. **P8b — health states (E) RESOLVED.**  Four distinct states:
     loading ("Checking system status…"), ok ("Live System Active"),
     degraded ("System degraded"), unreachable ("System status
     unavailable" + a note when the health query errors).  The old
     `status === undefined → degraded` bug (a failed query shown as
     degraded) is fixed.

176. **P8b — report-a-listing destination (F) still open, by design.**
     The mailto button renders only when VITE_REPORT_EMAIL is set (no
     address invented).  Where reports should go is the person's
     decision (email vs a backend /reports endpoint with storage —
     [architecture-decision]; see decision #5 below).

177. **P8b — FX rate from the backend (I) RESOLVED (supersedes the
     O3 sweep's shape).**  No default rate exists in code:
     `fx` is null until FX_KSH_PER_USD is set (FX_AS_OF / FX_SOURCE
     optional), served as {ksh_per_usd, as_of, source}.  The frontend
     currency module keeps a subscribe/getSnapshot store +
     `useCurrency()` (useSyncExternalStore) so every consumer
     re-renders when the rate arrives or the currency changes; with no
     rate the USD pill is disabled with a tooltip and a stored USD
     preference renders as KSh (display-level only — the preference
     is kept).  The Settings note is built from the response
     ("1 USD = X KSh (source) — as of D") and says fixed vs live via
     `source`.  The O3-era FxBlock fields
     (ksh_to_usd_rate/usd_to_ksh_rate/is_live) and the 129 default were
     REMOVED — they were part of this same unreleased delivery stream
     (decision #1 below).

178. **P8b — safe storage (J) RESOLVED.**  One `lib/storage.ts` helper
     (try/catch + in-memory fallback when localStorage throws);
     currency, language, and the default county all read/write through
     it.  A throwing localStorage no longer crashes the i18n init, the
     currency store, or Settings (test-covered).  No direct
     localStorage call remains outside the helper.

179. **P8b — default-county hook (K) RESOLVED.**  `lib/county-preference.ts`
     exposes getStoredDefaultCounty / setStoredDefaultCounty /
     `useDefaultCounty()` (validates against the live /counties/row_counts
     list).  Settings clears a stale stored county back to "All
     counties" with a notice (never a blank select); the Overview
     reads the stored default through the safe accessor (its existing
     initial-filter consumption).  Deal Finder / Market Insights
     wiring is deliberately NOT done — their county controls are
     exploratory pickers, not persistent filters; changing what those
     pages show by default is a product decision (#7 below).

180. **P8b — language options (L) RESOLVED.**  Settings builds the
     options from the registered i18n resources (Object.keys of
     resourceStore.data) with native names via Intl.DisplayNames —
     never a typed list.  No "Reset to defaults" action (the design
     shows none).

181. **P8b — shell (M) RESOLVED.**  The version text follows /meta's
     model_version (hidden when null — no typed "v2.4"); the permanent
     notification-dot decoration on the rail Notifications button is
     REMOVED (the mobile header dot had already gone in O2).  "Terra
     Intelligence Engine" stays as branding.

182. **P8b — backend additions + checks.**  /meta is additive:
     `fx` (nullable, no default) / `flag_definition` /
     `methodology`; env vars FX_KSH_PER_USD / FX_AS_OF / FX_SOURCE
     documented in .env.example + docs/api.md.  Tests: test_meta_fx.py
     rewritten (null when unset, follows env, as_of/source null when
     unset, other /meta fields unchanged), test_meta_p8b.py new
     (flag_definition + methodology from the canonical constants,
     no-unverifiable-claims guard, no NaN/inf), test_data_explorer.py
     extended (flag_definition in happy + degenerate paths).  Backend:
     307 passed / 1 skipped, ruff check + format clean.  Frontend:
     typecheck + lint + build + 135 tests (37 new) pass.  OpenAPI
     snapshot regenerated; scripts/check-hardcoded.sh clean.

183. **P8b — render verification.**  Playwright at 1440 + 390 against
     the mocked API shaped from the REAL schemas (20 captures in
     work/screenshots/p78-final/): Data Explorer default /
     no-threshold / ?tab=prices / price-distribution-error /
     feature-evaluation-error / alternate values / USD toggle / sw;
     About default / alternate values / degraded / unreachable;
     Settings default / fx-null / stale-county; mobile (scrollWidth =
     390 = innerWidth on every mobile capture).  Text-level
     assertions verified the threshold, flag-window, MedAPE, level,
     model-list, rate-note, USD-disabled, and stale-county copy all
     follow the mock — changing the mock changed the text.

184. **P8b — decisions for the person (numbered).**
     1. FX block reshape: the O3-era fields (ksh_to_usd_rate /
        usd_to_ksh_rate / is_live + the 129 default + the
        KSH_TO_USD_RATE env name) were REPLACED by the P8b shape
        (ksh_per_usd / as_of / source + FX_* env names + null
        default).  Both sides + tests + mocks were updated together;
        if any deployment already set KSH_TO_USD_RATE, re-set it as
        FX_KSH_PER_USD.
     2. Live FX feed: still an [architecture-decision] — the rate is
        operator-maintained and read at startup.
     3. Report-a-listing destination (email vs backend /reports
        endpoint with storage) — [architecture-decision].
     4. /meta's inner coverage-rule defaults (`.get(key, 10)` etc.)
        remain the documented B0-era OPEN allowlist item — confirm
        coverage_rules.json always carries the keys in production.
     5. A severity accent for the missing-values card requires a
        backend-configured `missing_severe_pct` first (the typed 50%
        was removed, not faked).
     6. Kiswahili native review (all sw keys added since P2b,
        including the ~100 new de.*/about.*/settings.* keys).
     7. Wire `useDefaultCounty()` into Deal Finder / Market Insights
        if you want the default county to shape those pages' initial
        view too (product decision).
     8. The four undesigned Data Explorer tabs (#162) — each needs a
        design + its own endpoint decision before building.

## Part B — Suspect-listing gate (2026-11-19)

A serve-time data-quality gate that keeps listings with implausible
listed-vs-predicted ratios out of the Deal Finder's deal signal.  Added in
response to the Karen-at-KSh-100K/acre case the global 1st–99th percentile
``data_quality_flag`` missed (a global trim cannot see a listing that is
locally absurd but globally in-range).

**Gate definition** (``backend/app/schemas/canonical.py``):

- ``SUSPECT_RATIO_LOW = 0.05`` — listed per-acre price < 5 % of the model's
  location-aware prediction → ``suspect_reason = "listed_far_below_model"``.
- ``SUSPECT_RATIO_HIGH = 20.0`` — listed > 20× predicted →
  ``suspect_reason = "listed_far_above_model"``.
- A non-finite or non-positive ``size_acres`` is ALSO suspect
  (``suspect_reason = "non_finite_size"``) — those rows produced
  ``price_per_acre = inf`` before the A1 size fix.

**Where it runs:** ``backend/app/services/suspect_gate.py`` derives
``is_suspect`` + ``suspect_reason`` from the existing
``listed_over_predicted`` and ``size_acres`` columns at serve time.  It is
NEVER written to ``artifacts/`` (no retrain, no artifact edit).  The
``/listings/scored`` and ``/listings/scored/export.csv`` endpoints gained an
``is_suspect`` query param (same true/false/absent pattern as
``data_quality_flag``); the CSV gained ``is_suspect`` + ``suspect_reason``
columns.  ``ListingsScoredRow`` gained ``is_suspect: bool`` and
``suspect_reason: str | None``.  The verdict field and its 3-value enum are
unchanged.

**Corpus counts:** the overview ``VerdictsBlock`` now reports ``n_suspect``
separately and EXCLUDES suspects from the underpriced/fair/overpriced counts
(``n_unknown`` is rebalanced so the four counts still sum to ``n_listings``).

**Frontend:** ``ResultsTable`` and ``ListingDetailPanel`` render a grey
"Suspect data" chip (tooltip = reason) instead of the verdict chip and "—"
instead of the % / "asking is N% below the range" when ``is_suspect``.  The
"Hide possible data errors" toggle now also hides suspect rows, and the
default Deal Finder view hides them (``hideDataErrors`` defaults to true).

**Open items / known limits:**

1. The gate is a simple ratio band on ``listed_over_predicted``.  It does
   not know about parcel size tiers, so a genuinely cheap large ranch
   (e.g. 110468626 — 4 000 acres at KSh 250k/acre) can read as
   ``listed_far_below_model`` when the model baseline is a global/county
   median that ignores size.  The real size-aware model prediction (Cell
   9.6) would not flag it; this is a property of the baseline, not the
   gate.  Revisit if false-suspect noise on large parcels becomes common.
2. ``is_suspect`` is computed per-request from the cached
   ``listings_scored_df`` (a copy is made each serve).  At the dataset's
   current size (~6k rows) this is microseconds; if the frame grows 100×,
   cache the columns on the registry alongside the frame.
3. The Part B tests use a fixture ``listings_scored.parquet`` built from
   the real CSV with a global-median ``predicted`` heuristic
   (``backend/tests/fixtures/listings_scored_fixture.py``), because the
   real model artifacts were not shipped and the hard constraints forbid a
   retrain.  The gate LOGIC is identical whether the predicted comes from
   the real model or this baseline; the specific rows flagged differ.
   Swap the fixture for the real parquet once Notebook 3 is rerun.
4. NaN ``listed_over_predicted`` (no prediction) is treated as NOT suspect
   — those rows are already covered by ``data_quality_flag`` and the
   usable-frame filter.  If a NaN-ratio row should be suspect, say so and
   extend ``compute_suspect_columns``.
