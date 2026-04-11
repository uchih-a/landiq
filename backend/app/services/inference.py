"""MLP inference service for land price prediction."""

"""MLP inference service for land price prediction."""

import math
import os
import re
from typing import Dict, List, Optional, Tuple

import httpx
import joblib
import numpy as np
import pluscodes
import torch
import torch.nn as nn
from geopy.distance import geodesic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.historical import CountyStat, GeocodeCache

# Reference cities for distance calculations
REFERENCE_CITIES: Dict[str, Tuple[float, float]] = {
    "Nairobi": (-1.2921, 36.8219),
    "Mombasa": (-4.0435, 39.6682),
    "Kisumu": (-0.1022, 34.7617),
    "Nakuru": (-0.3031, 36.0800),
    "Eldoret": (0.5143, 35.2698),
    "Thika": (-1.0332, 37.0693),
    "Malindi": (-3.2138, 40.1169),
    "Kitale": (1.0154, 35.0062),
    "Garissa": (-0.4532, 39.6460),
    "Nyeri": (-0.4167, 36.9500),
}

URBAN_CENTRES: Dict[str, Tuple[float, float]] = {
    **REFERENCE_CITIES,
    "Naivasha": (-0.7170, 36.4310),
    "Machakos": (-1.5177, 37.2634),
    "Kericho": (-0.3681, 35.2862),
    "Kakamega": (0.2827, 34.7519),
    "Embu": (-0.5300, 37.4500),
    "Meru": (0.0467, 37.6496),
    "Lamu": (-2.2686, 40.9020),
    "Voi": (-3.3956, 38.5562),
}

NAIROBI = (-1.2921, 36.8219)

# Plus Code regex pattern
PLUS_CODE_REGEX = re.compile(
    r"^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$"
)


class AdaptiveMLP(nn.Module):
    """Adaptive MLP neural network for land price prediction."""

    def __init__(
        self, input_dim: int, hidden_layers: List[int], dropout: float = 0.2
    ):
        super().__init__()
        layers = []
        prev = input_dim
        for h in hidden_layers:
            layers += [
                nn.Linear(prev, h),
                nn.BatchNorm1d(h),
                nn.ReLU(),
                nn.Dropout(dropout),
            ]
            prev = h
        layers.append(nn.Linear(prev, 1))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(1)


class ModelRegistry:
    """Singleton registry for MLP model and artifacts."""

    _model: Optional[AdaptiveMLP] = None
    _scaler: Optional[object] = None
    _feature_list: List[str] = []
    _hidden_layers: List[int] = []
    _county_mean_map: Dict[str, float] = {}
    _global_mean: float = 0.0
    _loaded: bool = False

    @classmethod
    def load(cls) -> None:
        """Load model artifacts from MODEL_DIR."""
        settings = get_settings()
        model_dir = settings.MODEL_DIR

        model_path = os.path.join(model_dir, "mlp_model.pt")
        scaler_path = os.path.join(model_dir, "mlp_scaler.pkl")
        feature_list_path = os.path.join(model_dir, "mlp_feature_list.pkl")
        hidden_layers_path = os.path.join(model_dir, "mlp_hidden_layers.pkl")
        county_map_path = os.path.join(model_dir, "mlp_county_mean_map.pkl")
        global_mean_path = os.path.join(model_dir, "mlp_global_mean.pkl")

        for path, name in [
            (model_path, "mlp_model.pt"),
            (scaler_path, "mlp_scaler.pkl"),
            (feature_list_path, "mlp_feature_list.pkl"),
            (hidden_layers_path, "mlp_hidden_layers.pkl"),
            (county_map_path, "mlp_county_mean_map.pkl"),
            (global_mean_path, "mlp_global_mean.pkl"),
        ]:
            if not os.path.exists(path):
                raise RuntimeError(
                    f"Model artifact '{name}' not found at {path}. "
                    f"Please ensure all model files are in {model_dir}"
                )

        cls._scaler = joblib.load(scaler_path)
        cls._feature_list = joblib.load(feature_list_path)
        cls._hidden_layers = joblib.load(hidden_layers_path)
        cls._county_mean_map = joblib.load(county_map_path)
        cls._global_mean = joblib.load(global_mean_path)

        input_dim = len(cls._feature_list)
        cls._model = AdaptiveMLP(input_dim, cls._hidden_layers)

        state_dict = torch.load(model_path, map_location="cpu", weights_only=True)
        cls._model.load_state_dict(state_dict)
        cls._model.eval()

        cls._loaded = True
        print(f"[ModelRegistry] Loaded MLP model with {input_dim} features")

    @classmethod
    def encode_county(cls, county: Optional[str]) -> float:
        """Return target-encoded county value, falling back to global mean."""
        if county and county in cls._county_mean_map:
            return float(cls._county_mean_map[county])
        return float(cls._global_mean)

    @classmethod
    def is_loaded(cls) -> bool:
        """Check if model is loaded."""
        return cls._loaded

    @classmethod
    def predict(cls, feature_dict: Dict[str, float]) -> float:
        """Run prediction with named features."""
        if not cls._loaded or cls._model is None or cls._scaler is None:
            raise RuntimeError("Model not loaded. Call ModelRegistry.load() first.")

        features = []
        for name in cls._feature_list:
            if name not in feature_dict:
                raise ValueError(f"Missing feature: {name}")
            features.append(feature_dict[name])

        X = np.array(features).reshape(1, -1)
        X_scaled = cls._scaler.transform(X)
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)

        with torch.no_grad():
            log_pred = cls._model(X_tensor).item()

        return float(log_pred)


# ── Geocoding helpers ─────────────────────────────────────────────────────────

async def _cache_geocode(
    db: AsyncSession,
    normalized_text: str,
    lat: float,
    lng: float,
    county: Optional[str],
) -> None:
    """Save a geocode result to the cache table."""
    try:
        cache_entry = GeocodeCache(
            location_text=normalized_text,
            latitude=lat,
            longitude=lng,
            county=county,
        )
        db.add(cache_entry)
        await db.flush()
    except Exception:
        await db.rollback()


async def _reverse_geocode_county(
    lat: float,
    lng: float,
    settings,
) -> Optional[str]:
    """Reverse-geocode a lat/lng to extract a Kenyan county name.

    Nominatim returns Kenyan counties under the 'state' key in the address
    dict, not 'county'. We check both for safety.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lng, "format": "json"},
                headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
            )
            data = response.json()
            address = data.get("address", {})
            # In Kenya, Nominatim maps counties to 'state'
            return address.get("state") or address.get("county") or None
    except Exception as e:
        print(f"[_reverse_geocode_county] Error: {e}")
    return None


async def geocode_location(
    location_text: str,
    db: AsyncSession,
) -> Tuple[Optional[float], Optional[float], Optional[str], float]:
    """
    Geocode a location string.

    Priority:
      1. DB cache
      2. Plus Code  → decoded locally, reverse-geocoded for county
      3. Text query → Nominatim

    Returns: (latitude, longitude, county, geo_confidence)
    """
    settings = get_settings()
    normalized_text = location_text.lower().strip()

    # ── 1. Cache lookup ───────────────────────────────────────────────────────
    result = await db.execute(
        select(GeocodeCache).where(GeocodeCache.location_text == normalized_text)
    )
    cached = result.scalar_one_or_none()
    if cached:
        return cached.latitude, cached.longitude, cached.county, 0.8

    # ── 2. Plus Code: decode locally ─────────────────────────────────────────
    if PLUS_CODE_REGEX.match(location_text.strip().upper()):
        try:
            decoded = pluscodes.decode(location_text.strip().upper())
            center = decoded.center()
            lat = float(center.lat)
            lng = float(center.lon)
    
            # Reject degenerate coordinates (poles / antimeridian)
            if abs(lat) > 85 or abs(lng) > 179:
                raise ValueError(f"Plus Code decoded to degenerate coordinates: {lat}, {lng}")
    
            geo_confidence = 1.0
            county = await _reverse_geocode_county(lat, lng, settings)
            await _cache_geocode(db, normalized_text, lat, lng, county)
            return lat, lng, county, geo_confidence
        except Exception as e:
            print(f"[geocode_location] Plus Code decode error: {e}")
            return None, None, None, 0.0
    # ── 3. Text query: Nominatim ──────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": f"{location_text}, Kenya",
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "ke",
                    "addressdetails": 1,
                },
                headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
            )
            response.raise_for_status()
            data = response.json()

            if data:
                result_data = data[0]
                lat = float(result_data["lat"])
                lng = float(result_data["lon"])

                # Kenyan counties come back as 'state' in Nominatim address dict
                address = result_data.get("address", {})
                county = address.get("state") or address.get("county") or None

                result_type = result_data.get("type", "").lower()
                if result_type in ["city", "town", "suburb", "village"]:
                    geo_confidence = 0.8
                elif result_type in ["county", "state", "region"]:
                    geo_confidence = 0.6
                else:
                    geo_confidence = 0.7

                await _cache_geocode(db, normalized_text, lat, lng, county)
                return lat, lng, county, geo_confidence

    except Exception as e:
        print(f"[geocode_location] Nominatim error: {e}")

    return None, None, None, 0.0


# ── Feature engineering ───────────────────────────────────────────────────────

def compute_features(
    lat: float,
    lng: float,
    size_acres: float,
    amenity_score: float,
    accessibility_score: float,
    county: Optional[str],
    geo_confidence: float,
    county_encoded: float,
) -> Dict[str, float]:
    """Compute all features for both the database and the ML model."""

    dist_to_nairobi = geodesic((lat, lng), NAIROBI).km
    dist_to_reference = min(
        geodesic((lat, lng), coord).km for coord in REFERENCE_CITIES.values()
    )
    dist_to_city = min(
        geodesic((lat, lng), coord).km for coord in URBAN_CENTRES.values()
    )

    return {
        # ── 10 ML model inputs ────────────────────────────────────────────
        "log_size_acres": math.log(max(size_acres, 0.01)),
        "dist_to_nairobi_km": dist_to_nairobi,
        "dist_to_county_town_km": dist_to_city,
        "reference_city_dist_km": dist_to_reference,
        "geocode_confidence": geo_confidence,
        "amenities_score": amenity_score,
        "accessibility_score": accessibility_score,
        "latitude": lat,
        "longitude": lng,
        "county_encoded": county_encoded,

        # ── DB / display extras (not fed to model) ────────────────────────
        "log_land_size": math.log(max(size_acres, 0.01)),
        "dist_to_reference_km": dist_to_reference,
        "dist_to_city_km": dist_to_city,
    }


def classify_influence(feature_name: str, value: float) -> Tuple[str, str]:
    """Classify feature influence for display."""
    if feature_name == "dist_to_nairobi_km":
        if value < 50:
            return ("High", "positive")
        elif value < 150:
            return ("Moderate", "negative")
        else:
            return ("Low", "negative")

    elif feature_name in ["amenities_score", "accessibility_score"]:
        if value > 67:
            return ("High", "positive")
        elif value > 34:
            return ("Moderate", "positive")
        else:
            return ("Low", "neutral")

    elif feature_name == "log_land_size":
        if value > 3:
            return ("High", "negative")
        elif value > 1:
            return ("Moderate", "neutral")
        else:
            return ("Low", "neutral")

    elif feature_name == "geo_confidence":
        if value > 0.8:
            return ("Neutral", "neutral")
        elif value < 0.5:
            return ("Low", "neutral")
        else:
            return ("Moderate", "neutral")

    elif feature_name in ["latitude", "longitude"]:
        return ("Moderate", "neutral")

    elif feature_name == "county_encoded":
        if value > 14.5:
            return ("High", "positive")
        elif value > 13.0:
            return ("Moderate", "neutral")
        else:
            return ("Low", "neutral")

    return ("Moderate", "neutral")


# ── Main prediction pipeline ──────────────────────────────────────────────────

async def run_prediction(
    location_text: str,
    size_acres: float,
    amenity_score: float,
    accessibility_score: float,
    db: AsyncSession,
) -> Dict:
    """Run the complete prediction pipeline."""

    # Step 1: Geocode
    lat, lng, county, geo_confidence = await geocode_location(location_text, db)
    if lat is None:
        raise ValueError("Could not resolve location")

    # Step 2: Encode county for model input
    county_encoded = ModelRegistry.encode_county(county)

    # Step 3: Compute features
    features = compute_features(
        lat=lat,
        lng=lng,
        size_acres=size_acres,
        amenity_score=amenity_score,
        accessibility_score=accessibility_score,
        county=county,
        geo_confidence=geo_confidence,
        county_encoded=county_encoded,
    )

    # Step 4: Run model
    log_pred = ModelRegistry.predict(features)
    # Guard against degenerate coordinates producing astronomical prices
    # Clamps to log range of KSh 10,000 – 500,000,000 per acre
    log_pred = max(9.2, min(log_pred, 20.0))
    # Step 5: Price outputs
    price_per_acre = int(math.exp(log_pred))
    price_total = int(price_per_acre * size_acres)
    price_low = int(price_per_acre * 0.70)
    price_high = int(price_per_acre * 1.30)

    # Step 6: Feature breakdown for UI
    display_names = {
        "log_size_acres":         ("Plot Size",               f"{size_acres:.2f}",                                "acres"),
        "dist_to_nairobi_km":     ("Distance to Nairobi",     f"{features['dist_to_nairobi_km']:.1f}",            "km"),
        "amenities_score":        ("Amenities Access",        f"{amenity_score:.0f}",                             "/ 100"),
        "accessibility_score":    ("Road Accessibility",      f"{accessibility_score:.0f}",                       "/ 100"),
        "reference_city_dist_km": ("Reference City Distance", f"{features['reference_city_dist_km']:.1f}",        "km"),
        "dist_to_county_town_km": ("Nearest Urban Centre",    f"{features['dist_to_county_town_km']:.1f}",        "km"),
        "geocode_confidence":     ("Location Precision",      f"{geo_confidence * 100:.0f}",                      "%"),
        "county_encoded":         ("County Price Index",      f"{features['county_encoded']:.2f}",                "log KSh/acre"),
        "latitude":               ("Latitude",                f"{lat:.4f}",                                       "°"),
        "longitude":              ("Longitude",               f"{lng:.4f}",                                       "°"),
    }

    feature_breakdown = []
    for key, (name, value, unit) in display_names.items():
        influence, direction = classify_influence(key, features[key])
        feature_breakdown.append({
            "name": name,
            "value": value,
            "unit": unit,
            "influence": influence,
            "direction": direction,
        })

    # Step 7: Geocode source
    if PLUS_CODE_REGEX.match(location_text.strip().upper()):
        geocode_source = "plus_code"
    elif county and location_text.lower().strip() == county.lower():
        geocode_source = "county"
    else:
        geocode_source = "nominatim"

    return {
        "lat": lat,
        "lng": lng,
        "county": county,
        "geocode_source": geocode_source,
        "log_pred": log_pred,
        "price_per_acre_ksh": price_per_acre,
        "price_total_ksh": price_total,
        "price_low_ksh": price_low,
        "price_high_ksh": price_high,
        "feature_breakdown": feature_breakdown,
        "features": features,
    }