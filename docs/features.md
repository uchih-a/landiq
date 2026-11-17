# Feature computation — function-to-cell mapping

This document maps every function in `src/landval/features/` to the exact
Notebook 1 cell it replicates. Formulas, constants, and rounding are copied
verbatim — nothing is rewritten from memory.

## geo.py

| Function | Notebook cell | Formula |
|---|---|---|
| `haversine_km` | Cell 4.2 | `R=6371.0`, standard haversine with `radians/sin/cos/sqrt/atan2` |
| `haversine_km_vectorised` | Cell 4.2 (vectorised) | Same formula, numpy broadcasting |
| `EARTH_RADIUS_KM` | Cell 5.0 / Cell 6.1 | `6371.0` — used in BallTree distance scaling |

## counties.py

| Function | Notebook cell | Method |
|---|---|---|
| `CountyLookup.__init__` | Cell 4.9 | Loads `kenya_counties.gpkg`, layer `ADM_ADM_1`, renames `NAME_1`→`county`, reprojects to EPSG:4326 |
| `CountyLookup.assign_county` | Cell 4.10 | Spatial join: point-in-polygon via `sindex.query(point, predicate="intersects")` |
| `KE_BOUNDS` | Cell 3.3 | `lat: (-4.72, 4.62), lon: (33.91, 41.91)` |

## proximity.py

| Function | Notebook cell | Formula |
|---|---|---|
| `dist_to_nairobi_km` | Cell 4.4 | `round(haversine_km(lat, lon, NAIROBI_CBD[0], NAIROBI_CBD[1]), 2)` |
| `dist_to_county_town_km` | Cell 4.4 | `round(haversine_km(lat, lon, *COUNTY_TOWNS[county]), 2)` |
| `dist_to_water_body_km` | Cell 4.4 | `round(min(haversine_km(lat, lon, wlat, wlon) for _, wlat, wlon in WATER_BODIES[county]), 2)` — NaN when county not in WATER_BODIES |
| `reference_city_and_dist` | Cell 4.13 (`get_reference_city_v2`) | Nairobi-adjacent rule: if county in NAIROBI_ADJACENT and dist_nairobi < dist_town → ref="Nairobi"; else ref=county; fallback ref="Nairobi". Returns (ref_city, ref_dist, county_town_dist). |

### Ambiguity in Cell 4.13

The notebook's `get_reference_city_v2` returns `round(dist_nairobi, 2)` as the
third value (assigned to `dist_to_county_town_km`) when the county town is the
reference city. This means `dist_to_county_town_km` is the distance to
**Nairobi**, not to the county town, for non-Nairobi-adjacent counties. The
backend replicates this exactly for parity. See the parity report for mismatch
details.

## amenities.py

| Function | Notebook cell | Formula |
|---|---|---|
| `_build_tree` | Cell 5.4 (`build_tree`) | `coords = np.radians([[g.y, g.x] ...])`, `BallTree(coords, metric="haversine")` |
| `_nearest_distance_km` | Cell 5.4 (`calc_distances`) | `dist, _ = tree.query(coords, k=1)`, `dist * EARTH_RADIUS_KM` |
| `compute_score` | Cell 5.6 | `sum(weight * exp(-beta * dist_km))`, clipped [0,1], ×100, round 2dp |

### Parameters (from `scoring_params.json`)

| Amenity | Weight | Beta |
|---|---|---|
| hospital | 0.25 | 0.30 |
| school | 0.20 | 0.40 |
| market | 0.20 | 0.50 |
| bank | 0.15 | 0.50 |
| police | 0.05 | 0.30 |
| bus_stop | 0.10 | 0.80 |
| fuel | 0.05 | 0.60 |

## accessibility.py

| Function | Notebook cell | Formula |
|---|---|---|
| `_build_road_tree` | Cell 6.3 (`build_road_tree`) | Extract vertices from LineString geometries, flip (lon,lat)→(lat,lon), `BallTree(np.radians(coords), metric="haversine")` |
| `_nearest_road_distance_km` | Cell 6.4 | `dist, _ = tree.query(coords, k=1)`, `dist * EARTH_RADIUS_KM` |
| `_road_score_raw` | Cell 6.5 | `max over road types of weight * exp(-ROAD_BETA * dist)`, clipped [0,1] (pre-floor) |
| `compute_score` | Cell 6.8 | `SCORE_WEIGHTS.road * road + SCORE_WEIGHTS.town * town + SCORE_WEIGHTS.nairobi * nairobi`, clipped [0,1], ×100, round 2dp |

### Town and Nairobi decay (Cell 6.7)

- `town_score = exp(-TOWN_BETA * reference_city_dist_km)`, NaN→0
- `nairobi_score = exp(-NAIROBI_BETA * dist_to_nairobi_km)`, NaN→0

### Parameters (from `scoring_params.json`)

| Parameter | Value |
|---|---|
| ROAD_BETA | 0.5 |
| TOWN_BETA | 0.08 |
| NAIROBI_BETA | 0.04 |
| SCORE_WEIGHTS.road | 0.50 |
| SCORE_WEIGHTS.town | 0.30 |
| SCORE_WEIGHTS.nairobi | 0.20 |

### Road class weights

| Road class | Weight |
|---|---|
| motorway | 1.00 |
| trunk | 0.85 |
| primary | 0.75 |
| secondary | 0.60 |
| tertiary | 0.40 |
| unclassified | 0.20 |
| residential | 0.15 |
| track | 0.05 |
| path | 0.02 |

## infrastructure.py

| Function | Notebook cell | Formula |
|---|---|---|
| `_apply_exclusivity` | Cell 7.3 | full_fence+partial_fence→drop partial; borehole+water_tank→drop tank; grid+solar→drop solar |
| `compute_score` | Cell 7.4 | `clip(sum(weight * item) / MAX_INFRA_SCORE * 100, 0, 100)`, round 2dp |
| County median fallback | Cell 7.5 | When all items are "not sure": use `county_median_infrastructure[county]`, then `global_fallback_infrastructure` |

### Infrastructure items (from `scoring_params.json`)

| Item | Weight |
|---|---|
| borehole | 0.25 |
| piped_water | 0.20 |
| river_water | 0.10 |
| water_tank | 0.07 |
| grid_electric | 0.22 |
| solar_electric | 0.08 |
| full_fence | 0.18 |
| partial_fence | 0.08 |
| structures | 0.12 |
| internal_road | 0.08 |
| **MAX_INFRA_SCORE** | **1.38** |

## pipeline.py

| Function | Notebook cells | Description |
|---|---|---|
| `FeaturePipeline.__init__` | Cells 10.1–10.3 | Loads `scoring_params.json`, `reference_data.json`, `feature_manifest.json` |
| `compute_features` | Cells 4.4, 4.13, 5.6, 6.8, 7.4 | Orchestrates all calculators, returns every model feature + diagnostics |
| `index_load_report` | — | Reports load time and memory for each spatial index |

## Config file sources

| File | Notebook cell | Contents |
|---|---|---|
| `scoring_params.json` | Cell 10.1 | amenity_params, amenity_filters, road_weights, road/town/nairobi betas, score_weights, infra_items, max_infra_score, county_median_infrastructure, global_fallback_infrastructure, nairobi_reference_point |
| `reference_data.json` | Cell 10.2 | county_towns, water_bodies, nairobi_adjacent_counties, reference_city_rule |
| `feature_manifest.json` | Cell 10.3 | Feature list with definitions, computation methods, tolerances, parity fixture info |
