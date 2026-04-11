#!/usr/bin/env python3
"""Seed historical listings data from a CSV file."""

import argparse
import asyncio
import os
from pathlib import Path

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://landiq_user:devpassword@localhost:5432/landiq_db",
)

# Columns to drop before processing — not needed in the DB
DROP_COLUMNS = {
    "listing_url", "listing_no", "title", "prop_type", "list_date",
    "size_source", "geocode_source", "infra_source",
    # extra computed/flag columns not in the DB schema
    "price_flag", "log_price_ksh", "log_size_acres", "geocode_confidence",
    "dist_to_county_town_km", "reference_city",
}

# Columns that must not be NULL — rows missing any of these are dropped
REQUIRED_COLUMNS = [
    "location_text",  # renamed from 'location'
    "price_ksh",
    "size_acres",
    "price_per_acre",
    "log_price_per_acre",
]

ALLOWED_COLUMNS = {
    "location_text", "county", "latitude", "longitude",
    "price_ksh", "size_acres", "price_per_acre", "log_price_per_acre",
    "dist_to_nairobi_km", "dist_to_water_body_km", "reference_city_dist_km",
    "amenities_score", "accessibility_score", "infrastructure_score",
    "location_score", "source",
}


def prepare_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    # Rename 'location' -> 'location_text' to match DB column
    if "location" in df.columns and "location_text" not in df.columns:
        df = df.rename(columns={"location": "location_text"})

    # Drop unwanted columns
    cols_to_drop = [c for c in df.columns if c in DROP_COLUMNS]
    df = df.drop(columns=cols_to_drop)
    print(f"Dropped columns: {cols_to_drop}")

    # Drop rows where any required column is null
    before = len(df)
    df = df.dropna(subset=[c for c in REQUIRED_COLUMNS if c in df.columns])
    dropped = before - len(df)
    print(f"Dropped {dropped} rows with nulls in required fields ({before} -> {len(df)} rows)")

    # Add default source if missing
    if "source" not in df.columns:
        df["source"] = "property24"

    return df


async def seed_data(csv_path: str) -> None:
    print(f"Reading file: {csv_path}")
    df = pd.read_csv(csv_path)
    df = prepare_dataframe(df)

    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print("Inserting historical listings...")
        inserted = 0
        skipped = 0

        for _, row in df.iterrows():
            columns = []
            values = {}

            for col in df.columns:
                if col not in ALLOWED_COLUMNS:
                    continue
                if pd.notna(row[col]):
                    columns.append(col)
                    values[col] = row[col]

            if not columns:
                skipped += 1
                continue

            cols_str = ", ".join(columns)
            vals_str = ", ".join([f":{c}" for c in columns])

            query = text(f"""
                INSERT INTO historical_listings ({cols_str})
                VALUES ({vals_str})
                ON CONFLICT DO NOTHING
            """)

            result = await session.execute(query, values)
            if result.rowcount > 0:
                inserted += 1
            else:
                skipped += 1

        await session.commit()
        print(f"Inserted: {inserted} rows, Skipped: {skipped} rows")

        print("Updating county statistics...")
        update_query = text("""
            INSERT INTO county_stats (
                county, avg_price_per_acre, median_price_per_acre, listing_count,
                min_price, max_price, avg_size_acres,
                median_amenities_score, median_accessibility_score,
                latitude_centroid, longitude_centroid
            )
            SELECT
                county,
                AVG(price_per_acre)::bigint,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_acre)::bigint,
                COUNT(*),
                MIN(price_per_acre)::bigint,
                MAX(price_per_acre)::bigint,
                AVG(size_acres),
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amenities_score),
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY accessibility_score),
                AVG(latitude),
                AVG(longitude)
            FROM historical_listings
            WHERE county IS NOT NULL AND price_per_acre IS NOT NULL
            GROUP BY county
            ON CONFLICT (county) DO UPDATE SET
                avg_price_per_acre = EXCLUDED.avg_price_per_acre,
                median_price_per_acre = EXCLUDED.median_price_per_acre,
                listing_count = EXCLUDED.listing_count,
                min_price = EXCLUDED.min_price,
                max_price = EXCLUDED.max_price,
                avg_size_acres = EXCLUDED.avg_size_acres,
                median_amenities_score = EXCLUDED.median_amenities_score,
                median_accessibility_score = EXCLUDED.median_accessibility_score,
                latitude_centroid = EXCLUDED.latitude_centroid,
                longitude_centroid = EXCLUDED.longitude_centroid,
                updated_at = NOW()
        """)

        await session.execute(update_query)
        await session.commit()

        count_result = await session.execute(text("SELECT COUNT(*) FROM county_stats"))
        county_count = count_result.scalar()
        print(f"Updated statistics for {county_count} counties")

    await engine.dispose()
    print("Done!")


def main():
    parser = argparse.ArgumentParser(description="Seed historical listings from CSV file")
    parser.add_argument("--csv", required=True, help="Path to CSV file")
    args = parser.parse_args()

    if not Path(args.csv).exists():
        print(f"Error: File not found: {args.csv}")
        exit(1)

    asyncio.run(seed_data(args.csv))


if __name__ == "__main__":
    main()