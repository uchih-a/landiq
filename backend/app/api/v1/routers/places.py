"""Places endpoints — typeahead search + named-POI lookup.

GET /api/v1/places/search?q=...
    Ranked substring search over the Kenyan places gazetteer (towns, wards,
    suburbs, neighbourhoods extracted from the OSM PBF's ``places`` layer).
    Returns name, place_type, county, region subtitle, lat/lon, population.

GET /api/v1/places/nearby?lat&lon&radius_km&category
    Named-POI lookup within a radius of a coordinate.  Returns POIs from
    the names-enabled POI layer (``kenya_pois_named.gpkg`` — Cell 5.2's
    ogr2ogr with ``name`` added to the -select list).  Used by the predict
    endpoint's diagnostics for the "Nearby & Infrastructure" list.

Both endpoints return 503 ``DATA_UNAVAILABLE`` when the backing GPKG file
isn't present (the extraction script hasn't been run yet).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query, Request

from app.core.exceptions import AppError
from app.schemas.places import (
    NamedPOIResult,
    NearbyPOIsResponse,
    PlaceSearchResponse,
    PlaceSearchResult,
)

router = APIRouter(tags=["places"])

# Category filter enum — same as NamedPOIIndex.POI_CATEGORIES.
NearbyCategory = Literal["hospital", "school", "market", "bank", "police", "bus_stop", "fuel"]


@router.get("/places/search", response_model=PlaceSearchResponse)
async def search_places(
    request: Request,
    q: str = Query(..., min_length=1, description="Search query (substring, case-insensitive)"),
    limit: int = Query(10, ge=1, le=50, description="Max results (default 10)"),
) -> PlaceSearchResponse:
    """Typeahead search over the places gazetteer."""
    places_index = getattr(request.app.state, "places_index", None)
    if places_index is None or not places_index.loaded:
        raise AppError(
            code="DATA_UNAVAILABLE",
            message=(
                "The places gazetteer is not loaded. Run "
                "scripts/extract_poi_names.py against kenya-latest.osm.pbf "
                "to produce kenya_places.gpkg, then restart."
            ),
            status_code=503,
            details={"file": "kenya_places.gpkg"},
        )

    matches = places_index.search(q, limit=limit)
    results = [
        PlaceSearchResult(
            name=m.name,
            place_type=m.place_type,
            county=m.county,
            subtitle=m.subtitle,
            latitude=m.latitude,
            longitude=m.longitude,
            population=m.population,
        )
        for m in matches
    ]
    return PlaceSearchResponse(query=q, results=results, total=len(results))


@router.get("/places/nearby", response_model=NearbyPOIsResponse)
async def nearby_pois(
    request: Request,
    lat: float = Query(..., ge=-90, le=90, description="Latitude (WGS84)"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude (WGS84)"),
    radius_km: float = Query(5.0, gt=0, le=50, description="Search radius in km (default 5)"),
    category: NearbyCategory | None = Query(  # noqa: B008
        None,
        description="Filter to one category (hospital/school/market/bank/police/bus_stop/fuel)",
    ),
    limit: int = Query(20, ge=1, le=100, description="Max POIs to return (default 20)"),
) -> NearbyPOIsResponse:
    """Named POIs within radius_km of a coordinate."""
    poi_index = getattr(request.app.state, "named_poi_index", None)
    if poi_index is None or not poi_index.loaded:
        raise AppError(
            code="DATA_UNAVAILABLE",
            message=(
                "The named-POI layer is not loaded. Run "
                "scripts/extract_poi_names.py against kenya-latest.osm.pbf "
                "to produce kenya_pois_named.gpkg, then restart."
            ),
            status_code=503,
            details={"file": "kenya_pois_named.gpkg"},
        )

    pois = poi_index.nearby_named_pois(
        lat=lat, lon=lon, radius_km=radius_km, category=category, limit=limit
    )
    results = [
        NamedPOIResult(
            name=p.name,
            category=p.category,
            amenity=p.amenity,
            shop=p.shop,
            highway=p.highway,
            latitude=p.latitude,
            longitude=p.longitude,
            distance_km=p.distance_km,
            is_fallback=p.is_fallback,
        )
        for p in pois
    ]
    return NearbyPOIsResponse(
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        category=category,
        pois=results,
        total=len(results),
    )
