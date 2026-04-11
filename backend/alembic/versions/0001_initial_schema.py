"""Initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types explicitly with checkfirst=True so re-runs are safe.
    # create_type=False tells SQLAlchemy "I'm managing this myself",
    # which prevents create_table from trying to create them a second time.
    userrole = postgresql.ENUM("user", "admin", name="userrole", create_type=False)
    userrole.create(op.get_bind(), checkfirst=True)

    geocodesource = postgresql.ENUM(
        "plus_code", "county", "nominatim", name="geocodesource", create_type=False
    )
    geocodesource.create(op.get_bind(), checkfirst=True)

    modeltype = postgresql.ENUM("mlp", name="modeltype", create_type=False)
    modeltype.create(op.get_bind(), checkfirst=True)

    # users table
    # Pass create_type=False on every Enum column so create_table doesn't
    # attempt a second CREATE TYPE after we already did it above.
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "role",
            postgresql.ENUM("user", "admin", name="userrole", create_type=False),
            nullable=False,
            server_default="user",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # predictions table
    op.create_table(
        "predictions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("location_text", sa.String(length=255), nullable=False),
        sa.Column("county", sa.String(length=100), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column(
            "geocode_source",
            postgresql.ENUM("plus_code", "county", "nominatim", name="geocodesource", create_type=False),
            nullable=True,
        ),
        sa.Column("size_acres", sa.Float(), nullable=False),
        sa.Column("log_land_size", sa.Float(), nullable=False),
        sa.Column("amenity_score", sa.Float(), nullable=False),
        sa.Column("accessibility_score", sa.Float(), nullable=False),
        sa.Column("infrastructure_score", sa.Float(), nullable=False),
        sa.Column("dist_to_nairobi_km", sa.Float(), nullable=True),
        sa.Column("dist_to_water_body_km", sa.Float(), nullable=True),
        sa.Column("dist_to_reference_km", sa.Float(), nullable=True),
        sa.Column("dist_to_city_km", sa.Float(), nullable=True),
        sa.Column("geo_confidence", sa.Float(), nullable=True),
        sa.Column("location_score", sa.Float(), nullable=True),
        sa.Column("log_dist_to_nairobi", sa.Float(), nullable=True),
        sa.Column(
            "model_used",
            postgresql.ENUM("mlp", name="modeltype", create_type=False),
            nullable=False,
            server_default="mlp",
        ),
        sa.Column("log_pred", sa.Float(), nullable=False),
        sa.Column("price_per_acre_ksh", sa.BigInteger(), nullable=False),
        sa.Column("price_total_ksh", sa.BigInteger(), nullable=False),
        sa.Column("price_low_ksh", sa.BigInteger(), nullable=False),
        sa.Column("price_high_ksh", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_predictions_user_id", "predictions", ["user_id"])
    op.create_index("ix_predictions_county", "predictions", ["county"])
    op.create_index(
        "ix_predictions_user_created",
        "predictions",
        ["user_id", "created_at"],
    )

    # historical_listings table
    op.create_table(
        "historical_listings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("listing_url", sa.String(length=500), nullable=True),
        sa.Column("location_text", sa.String(length=255), nullable=False),
        sa.Column("county", sa.String(length=100), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("price_ksh", sa.BigInteger(), nullable=True),
        sa.Column("size_acres", sa.Float(), nullable=True),
        sa.Column("price_per_acre", sa.BigInteger(), nullable=True),
        sa.Column("log_price_per_acre", sa.Float(), nullable=True),
        sa.Column("dist_to_nairobi_km", sa.Float(), nullable=True),
        sa.Column("dist_to_water_body_km", sa.Float(), nullable=True),
        sa.Column("reference_city_dist_km", sa.Float(), nullable=True),
        sa.Column("amenities_score", sa.Float(), nullable=True),
        sa.Column("accessibility_score", sa.Float(), nullable=True),
        sa.Column("infrastructure_score", sa.Float(), nullable=True),
        sa.Column("location_score", sa.Float(), nullable=True),
        sa.Column("geocode_source", sa.String(length=50), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="property24"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_historical_listings_county", "historical_listings", ["county"])
    op.create_index("ix_historical_listings_price_per_acre", "historical_listings", ["price_per_acre"])

    # county_stats table
    op.create_table(
        "county_stats",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("county", sa.String(length=100), nullable=False),
        sa.Column("avg_price_per_acre", sa.BigInteger(), nullable=True),
        sa.Column("median_price_per_acre", sa.BigInteger(), nullable=True),
        sa.Column("listing_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("min_price", sa.BigInteger(), nullable=True),
        sa.Column("max_price", sa.BigInteger(), nullable=True),
        sa.Column("avg_size_acres", sa.Float(), nullable=True),
        sa.Column("median_amenities_score", sa.Float(), nullable=True),
        sa.Column("median_accessibility_score", sa.Float(), nullable=True),
        sa.Column("latitude_centroid", sa.Float(), nullable=True),
        sa.Column("longitude_centroid", sa.Float(), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("county"),
    )
    op.create_index("ix_county_stats_county", "county_stats", ["county"])

    # geocode_cache table
    op.create_table(
        "geocode_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("location_text", sa.String(length=255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("county", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("location_text"),
    )
    op.create_index("ix_geocode_cache_location_text", "geocode_cache", ["location_text"])


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_table("geocode_cache")
    op.drop_table("county_stats")
    op.drop_table("historical_listings")
    op.drop_table("predictions")
    op.drop_table("users")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS modeltype")
    op.execute("DROP TYPE IF EXISTS geocodesource")
    op.execute("DROP TYPE IF EXISTS userrole")