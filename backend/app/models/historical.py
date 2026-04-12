"""Historical data models."""

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class HistoricalListing(Base):
    """Historical land listing data — sourced from historical_data table."""

    __tablename__ = "historical_data"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_url: Mapped[Optional[str]] = mapped_column(Text)
    listing_no: Mapped[Optional[int]] = mapped_column(BigInteger)
    title: Mapped[Optional[str]] = mapped_column(Text)
    location: Mapped[Optional[str]] = mapped_column(Text)
    prop_type: Mapped[Optional[str]] = mapped_column(String(100))
    list_date: Mapped[Optional[str]] = mapped_column(String(50))
    price_ksh: Mapped[Optional[float]] = mapped_column(Float)
    price_flag: Mapped[Optional[str]] = mapped_column(String(50))
    log_price_ksh: Mapped[Optional[float]] = mapped_column(Float)
    size_acres: Mapped[Optional[float]] = mapped_column(Float)
    size_source: Mapped[Optional[str]] = mapped_column(String(100))
    log_size_acres: Mapped[Optional[float]] = mapped_column(Float)
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    geocode_source: Mapped[Optional[str]] = mapped_column(String(100))
    geocode_confidence: Mapped[Optional[float]] = mapped_column(Float)
    county: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    dist_to_nairobi_km: Mapped[Optional[float]] = mapped_column(Float)
    dist_to_county_town_km: Mapped[Optional[float]] = mapped_column(Float)
    reference_city: Mapped[Optional[str]] = mapped_column(String(100))
    reference_city_dist_km: Mapped[Optional[float]] = mapped_column(Float)
    amenities_score: Mapped[Optional[float]] = mapped_column(Float)
    accessibility_score: Mapped[Optional[float]] = mapped_column(Float)
    price_per_acre: Mapped[Optional[float]] = mapped_column(Float, index=True)
    log_price_per_acre: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CountyStat(Base):
    """Aggregated statistics per county."""

    __tablename__ = "county_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    county: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    avg_price_per_acre: Mapped[Optional[int]] = mapped_column(BigInteger)
    median_price_per_acre: Mapped[Optional[int]] = mapped_column(BigInteger)
    listing_count: Mapped[int] = mapped_column(Integer, default=0)
    min_price: Mapped[Optional[int]] = mapped_column(BigInteger)
    max_price: Mapped[Optional[int]] = mapped_column(BigInteger)
    avg_size_acres: Mapped[Optional[float]] = mapped_column(Float)
    median_amenities_score: Mapped[Optional[float]] = mapped_column(Float)
    median_accessibility_score: Mapped[Optional[float]] = mapped_column(Float)
    latitude_centroid: Mapped[Optional[float]] = mapped_column(Float)
    longitude_centroid: Mapped[Optional[float]] = mapped_column(Float)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class GeocodeCache(Base):
    """Cache for geocoding results."""

    __tablename__ = "geocode_cache"

    id: Mapped[int] = mapped_column(primary_key=True)
    location_text: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    county: Mapped[Optional[str]] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
