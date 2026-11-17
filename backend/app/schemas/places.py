"""Request and response schemas for the places endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PlaceSearchResult(BaseModel):
    """One row of GET /api/v1/places/search results."""

    name: str
    place_type: str | None = Field(
        None, description="OSM place tag value (city, town, suburb, ...)"
    )
    county: str | None = Field(
        None, description="County (filled by the backend via point-in-polygon; may be null)"
    )
    subtitle: str = Field(..., description="Region subtitle (e.g. 'Nairobi Metropolitan — town')")
    latitude: float
    longitude: float
    population: int | None = Field(None, description="OSM population tag (may be null)")


class PlaceSearchResponse(BaseModel):
    """GET /api/v1/places/search response."""

    query: str
    results: list[PlaceSearchResult]
    total: int


class NamedPOIResult(BaseModel):
    """One named POI from GET /api/v1/places/nearby."""

    name: str
    category: str = Field(
        ..., description="hospital / school / market / bank / police / bus_stop / fuel / other"
    )
    amenity: str | None = None
    shop: str | None = None
    highway: str | None = None
    latitude: float
    longitude: float
    distance_km: float
    is_fallback: bool = Field(
        False,
        description="True when the name is a generated fallback label ('<category> near <town>') rather than a real OSM name.",
    )


class NearbyPOIsResponse(BaseModel):
    """GET /api/v1/places/nearby response."""

    lat: float
    lon: float
    radius_km: float
    category: str | None = Field(None, description="Category filter (None = all categories)")
    pois: list[NamedPOIResult]
    total: int
