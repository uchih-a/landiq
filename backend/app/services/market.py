"""Market data service for analytics and insights."""

import math
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.historical import CountyStat, HistoricalListing
from app.models.prediction import Prediction


def _safe_int(value) -> int:
    """Convert a value to int, returning 0 for None or NaN."""
    if value is None:
        return 0
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return 0
        return int(f)
    except (TypeError, ValueError):
        return 0


def _safe_float(value) -> Optional[float]:
    """Convert a value to float, returning None for None or NaN."""
    if value is None:
        return None
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


async def get_market_summary(
    db: AsyncSession, county: Optional[str] = None
) -> dict:
    """Get market summary statistics."""
    listing_query = select(HistoricalListing)
    if county:
        listing_query = listing_query.where(HistoricalListing.county == county)

    count_result = await db.execute(
        select(func.count()).select_from(listing_query.subquery())
    )
    total_listings = count_result.scalar() or 0

    if county:
        counties_covered = 1
    else:
        counties_result = await db.execute(
            select(func.count(func.distinct(HistoricalListing.county)))
        )
        counties_covered = counties_result.scalar() or 0

    median_result = await db.execute(
        select(
            func.percentile_cont(0.5).within_group(
                HistoricalListing.price_per_acre
            )
        )
        .where(HistoricalListing.price_per_acre.isnot(None))
        .where(HistoricalListing.county == county if county else True)
    )
    national_median_price = _safe_int(median_result.scalar())

    avg_result = await db.execute(
        select(func.avg(HistoricalListing.price_per_acre))
        .where(HistoricalListing.price_per_acre.isnot(None))
        .where(HistoricalListing.county == county if county else True)
    )
    national_avg_price = _safe_int(avg_result.scalar())

    expensive_result = await db.execute(
        select(CountyStat.county)
        .where(CountyStat.listing_count >= 3)
        .order_by(CountyStat.median_price_per_acre.desc())
        .limit(1)
    )
    most_expensive = expensive_result.scalar() or (county or "Nairobi")

    value_result = await db.execute(
        select(CountyStat.county)
        .where(CountyStat.listing_count >= 5)
        .order_by(CountyStat.median_price_per_acre.asc())
        .limit(1)
    )
    best_value = value_result.scalar() or (county or "Laikipia")

    predictions_result = await db.execute(select(func.count(Prediction.id)))
    total_predictions = predictions_result.scalar() or 0

    last_updated_result = await db.execute(
        select(func.max(HistoricalListing.created_at))
    )
    last_updated = last_updated_result.scalar()

    return {
        "total_listings": total_listings,
        "counties_covered": counties_covered,
        "national_median_price_per_acre": national_median_price,
        "national_avg_price_per_acre": national_avg_price,
        "most_expensive_county": most_expensive,
        "best_value_county": best_value,
        "ols_r2": 0.71,
        "total_predictions_made": total_predictions,
        "last_updated": last_updated,
    }


async def get_county_stats(
    db: AsyncSession, county: Optional[str] = None
) -> List[dict]:
    """Get county statistics."""
    query = select(CountyStat).order_by(CountyStat.median_price_per_acre.desc())
    if county:
        query = query.where(CountyStat.county == county)

    result = await db.execute(query)
    counties = result.scalars().all()

    return [
        {
            "county": c.county,
            "avg_price_per_acre": c.avg_price_per_acre,
            "median_price_per_acre": c.median_price_per_acre,
            "listing_count": c.listing_count,
            "min_price": c.min_price,
            "max_price": c.max_price,
            "avg_size_acres": c.avg_size_acres,
            "median_amenities_score": c.median_amenities_score,
            "median_accessibility_score": c.median_accessibility_score,
            "latitude_centroid": c.latitude_centroid,
            "longitude_centroid": c.longitude_centroid,
        }
        for c in counties
    ]


async def get_spatial_listings(
    db: AsyncSession, county: Optional[str] = None
) -> List[dict]:
    """Get spatial listing data points."""
    query = (
        select(HistoricalListing)
        .where(HistoricalListing.latitude.isnot(None))
        .where(HistoricalListing.longitude.isnot(None))
        .where(HistoricalListing.price_per_acre.isnot(None))
    )
    if county:
        query = query.where(HistoricalListing.county == county)

    result = await db.execute(query)
    listings = result.scalars().all()

    return [
        {
            "latitude": l.latitude,
            "longitude": l.longitude,
            "price_per_acre": _safe_int(l.price_per_acre),
            "size_acres": _safe_float(l.size_acres) or 1.0,
            "county": l.county or "Unknown",
        }
        for l in listings
        if _safe_float(l.price_per_acre) is not None
    ]


async def get_proximity_data(
    db: AsyncSession, county: Optional[str] = None
) -> dict:
    """Get proximity analysis data."""
    nairobi_query = (
        select(
            HistoricalListing.county,
            func.percentile_cont(0.5)
            .within_group(HistoricalListing.dist_to_nairobi_km)
            .label("median_dist"),
            func.percentile_cont(0.5)
            .within_group(HistoricalListing.log_price_per_acre)
            .label("median_log_price"),
            func.percentile_cont(0.5)
            .within_group(HistoricalListing.price_per_acre)
            .label("median_price"),
            func.count().label("listing_count"),
        )
        .where(HistoricalListing.dist_to_nairobi_km.isnot(None))
        .where(HistoricalListing.price_per_acre.isnot(None))
        .group_by(HistoricalListing.county)
        .having(func.count() >= 3)
    )
    if county:
        nairobi_query = nairobi_query.where(HistoricalListing.county == county)

    nairobi_result = await db.execute(nairobi_query)
    nairobi_data = [
        {
            "county": row.county,
            "dist_km": _safe_float(row.median_dist) or 0.0,
            "log_price": _safe_float(row.median_log_price) or 0.0,
            "price_ksh": _safe_int(row.median_price),
            "listing_count": row.listing_count,
        }
        for row in nairobi_result.all()
        if _safe_float(row.median_dist) is not None
    ]

    ref_query = (
        select(
            HistoricalListing.county,
            func.percentile_cont(0.5)
            .within_group(HistoricalListing.reference_city_dist_km)
            .label("median_dist"),
            func.percentile_cont(0.5)
            .within_group(HistoricalListing.log_price_per_acre)
            .label("median_log_price"),
            func.percentile_cont(0.5)
            .within_group(HistoricalListing.price_per_acre)
            .label("median_price"),
            func.count().label("listing_count"),
        )
        .where(HistoricalListing.reference_city_dist_km.isnot(None))
        .where(HistoricalListing.price_per_acre.isnot(None))
        .group_by(HistoricalListing.county)
        .having(func.count() >= 3)
    )
    if county:
        ref_query = ref_query.where(HistoricalListing.county == county)

    ref_result = await db.execute(ref_query)
    ref_data = [
        {
            "county": row.county,
            "dist_km": _safe_float(row.median_dist) or 0.0,
            "log_price": _safe_float(row.median_log_price) or 0.0,
            "price_ksh": _safe_int(row.median_price),
            "listing_count": row.listing_count,
        }
        for row in ref_result.all()
        if _safe_float(row.median_dist) is not None
    ]

    return {"nairobi": nairobi_data, "reference_city": ref_data}


async def get_score_data(
    db: AsyncSession, county: Optional[str] = None
) -> dict:
    """Get score analysis data (amenities and accessibility)."""
    bin_edges = [0, 20, 40, 60, 80, 100]
    bin_labels = ["0-20", "21-40", "41-60", "61-80", "81-100"]

    async def compute_bins(score_column):
        bins = []
        for i in range(len(bin_edges) - 1):
            low, high = bin_edges[i], bin_edges[i + 1]

            query = (
                select(
                    func.percentile_cont(0.5)
                    .within_group(HistoricalListing.price_per_acre)
                    .label("median_price"),
                    func.percentile_cont(0.25)
                    .within_group(HistoricalListing.price_per_acre)
                    .label("q25"),
                    func.percentile_cont(0.75)
                    .within_group(HistoricalListing.price_per_acre)
                    .label("q75"),
                    func.count().label("count"),
                )
                .where(score_column >= low)
                .where(score_column <= high)
                .where(HistoricalListing.price_per_acre.isnot(None))
            )
            if county:
                query = query.where(HistoricalListing.county == county)

            result = await db.execute(query)
            row = result.one()

            bins.append({
                "bin": bin_labels[i],
                "median_price": _safe_int(row.median_price),
                "q25_price": _safe_int(row.q25),
                "q75_price": _safe_int(row.q75),
                "listing_count": row.count or 0,
                "reliable": (row.count or 0) >= 5,
            })
        return bins

    amenities_bins = await compute_bins(HistoricalListing.amenities_score)
    accessibility_bins = await compute_bins(HistoricalListing.accessibility_score)

    return {"amenities": amenities_bins, "accessibility": accessibility_bins}


def _normalize(values: List[float], value: float) -> float:
    """Normalize a value to 0-1 range."""
    min_val = min(values)
    max_val = max(values)
    if max_val == min_val:
        return 0.5
    return (value - min_val) / (max_val - min_val)


async def get_best_investment(
    db: AsyncSession, county: Optional[str] = None
) -> List[dict]:
    """Get best investment opportunities ranked by a 5-dimension weighted composite score."""
    query = (
        select(CountyStat)
        .where(CountyStat.listing_count >= 5)
        .where(CountyStat.median_price_per_acre.isnot(None))
        .where(CountyStat.median_amenities_score.isnot(None))
        .where(CountyStat.median_accessibility_score.isnot(None))
    )
    if county:
        query = query.where(CountyStat.county == county)

    result = await db.execute(query)
    counties = result.scalars().all()

    if not counties:
        return []

    prices        = [c.median_price_per_acre for c in counties]
    amenities     = [c.median_amenities_score for c in counties]
    accessibility = [c.median_accessibility_score for c in counties]

    infra_query = (
        select(
            HistoricalListing.county,
            func.percentile_cont(0.5)
            .within_group(HistoricalListing.dist_to_nairobi_km)
            .label("median_infra_dist"),
        )
        .where(HistoricalListing.dist_to_nairobi_km.isnot(None))
        .group_by(HistoricalListing.county)
    )
    infra_result = await db.execute(infra_query)
    infra_map    = {row.county: float(row.median_infra_dist) for row in infra_result.all()}

    prox_query = (
        select(
            HistoricalListing.county,
            func.percentile_cont(0.5)
            .within_group(HistoricalListing.reference_city_dist_km)
            .label("median_prox_dist"),
        )
        .where(HistoricalListing.reference_city_dist_km.isnot(None))
        .group_by(HistoricalListing.county)
    )
    prox_result = await db.execute(prox_query)
    prox_map    = {row.county: float(row.median_prox_dist) for row in prox_result.all()}

    max_infra_dist = max(infra_map.values(), default=0.0)
    max_prox_dist  = max(prox_map.values(), default=0.0)

    infra_dists = [infra_map.get(c.county, max_infra_dist) for c in counties]
    prox_dists  = [prox_map.get(c.county, max_prox_dist)  for c in counties]

    W_AFFORDABILITY  = 0.35
    W_AMENITIES      = 0.20
    W_ACCESSIBILITY  = 0.20
    W_INFRASTRUCTURE = 0.15
    W_PROXIMITY      = 0.10

    scored = []
    for c in counties:
        affordability_score  = 1.0 - _normalize(prices, c.median_price_per_acre)
        amenity_score        = _normalize(amenities, c.median_amenities_score)
        access_score         = _normalize(accessibility, c.median_accessibility_score)

        raw_infra_dist       = infra_map.get(c.county, max_infra_dist)
        infrastructure_score = 1.0 - _normalize(infra_dists, raw_infra_dist)

        raw_prox_dist        = prox_map.get(c.county, max_prox_dist)
        proximity_score      = 1.0 - _normalize(prox_dists, raw_prox_dist)

        investment_score = (
            affordability_score    * W_AFFORDABILITY
            + amenity_score        * W_AMENITIES
            + access_score         * W_ACCESSIBILITY
            + infrastructure_score * W_INFRASTRUCTURE
            + proximity_score      * W_PROXIMITY
        )

        scored.append({
            "county": c.county,
            "investment_score": round(investment_score, 3),
            "median_price_per_acre": c.median_price_per_acre,
            "listing_count": c.listing_count,
            "median_amenities_score": c.median_amenities_score,
            "median_accessibility_score": c.median_accessibility_score,
            "affordability_score":  round(affordability_score,  2),
            "amenity_score":        round(amenity_score,         2),
            "access_score":         round(access_score,          2),
            "infrastructure_score": round(infrastructure_score,  2),
            "proximity_score":      round(proximity_score,       2),
        })

    scored.sort(key=lambda x: x["investment_score"], reverse=True)
    for i, item in enumerate(scored):
        item["rank"] = i + 1

    return scored[:5]


async def get_raw_proximity_listings(
    db: AsyncSession, county: Optional[str] = None
) -> dict:
    """Get raw, unaggregated proximity data for all individual listings."""
    nairobi_query = (
        select(
            HistoricalListing.county,
            HistoricalListing.dist_to_nairobi_km.label("dist_km"),
            HistoricalListing.log_price_per_acre.label("log_price"),
            HistoricalListing.price_per_acre.label("price_ksh"),
        )
        .where(HistoricalListing.dist_to_nairobi_km.isnot(None))
        .where(HistoricalListing.price_per_acre.isnot(None))
    )
    if county:
        nairobi_query = nairobi_query.where(HistoricalListing.county == county)

    nairobi_result = await db.execute(nairobi_query)
    nairobi_data = [
        {
            "county": row.county,
            "dist_km": _safe_float(row.dist_km) or 0.0,
            "log_price": _safe_float(row.log_price) or 0.0,
            "price_ksh": _safe_int(row.price_ksh),
        }
        for row in nairobi_result.all()
        if _safe_float(row.price_ksh) is not None
    ]

    ref_query = (
        select(
            HistoricalListing.county,
            HistoricalListing.reference_city_dist_km.label("dist_km"),
            HistoricalListing.log_price_per_acre.label("log_price"),
            HistoricalListing.price_per_acre.label("price_ksh"),
        )
        .where(HistoricalListing.reference_city_dist_km.isnot(None))
        .where(HistoricalListing.price_per_acre.isnot(None))
    )
    if county:
        ref_query = ref_query.where(HistoricalListing.county == county)

    ref_result = await db.execute(ref_query)
    ref_data = [
        {
            "county": row.county,
            "dist_km": _safe_float(row.dist_km) or 0.0,
            "log_price": _safe_float(row.log_price) or 0.0,
            "price_ksh": _safe_int(row.price_ksh),
        }
        for row in ref_result.all()
        if _safe_float(row.price_ksh) is not None
    ]

    return {"nairobi": nairobi_data, "reference_city": ref_data}
