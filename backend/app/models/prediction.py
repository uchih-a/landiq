"""Prediction model."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, DateTime, Enum, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user import User


class Prediction(Base):
    """Land price prediction record."""

    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    location_text: Mapped[str] = mapped_column(String(255), nullable=False)
    county: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    geocode_source: Mapped[Optional[str]] = mapped_column(
        Enum("plus_code", "county", "nominatim", name="geocodesource")
    )

    # 12 model input features
    size_acres: Mapped[float] = mapped_column(Float, nullable=False)
    log_land_size: Mapped[float] = mapped_column(Float, nullable=False)
    amenity_score: Mapped[float] = mapped_column(Float, nullable=False)
    accessibility_score: Mapped[float] = mapped_column(Float, nullable=False)
    infrastructure_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dist_to_reference_km: Mapped[Optional[float]] = mapped_column(Float)
    dist_to_city_km: Mapped[Optional[float]] = mapped_column(Float)
    geo_confidence: Mapped[Optional[float]] = mapped_column(Float)

    # Model output
    model_used: Mapped[str] = mapped_column(
        Enum("mlp", name="modeltype"), default="mlp", nullable=False
    )
    log_pred: Mapped[float] = mapped_column(Float, nullable=False)
    price_per_acre_ksh: Mapped[int] = mapped_column(BigInteger, nullable=False)
    price_total_ksh: Mapped[int] = mapped_column(BigInteger, nullable=False)
    price_low_ksh: Mapped[int] = mapped_column(BigInteger, nullable=False)
    price_high_ksh: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="predictions")

    __table_args__ = (
        {"sqlite_autoincrement": True},
    )
