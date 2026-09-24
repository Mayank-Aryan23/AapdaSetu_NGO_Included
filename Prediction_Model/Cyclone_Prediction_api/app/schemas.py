"""
schemas.py
──────────
Request / response models for Cyclone Prediction API.

Model input vector (9 features, exact order):
    sea_surface_temp_c, sea_level_pressure_hpa, cape_jkg,
    max_wind_speed_kmh, cyclone_season_active,
    ocean_heat_content_kjcm2, wind_shear_ms,
    vorticity_850hpa, relative_humidity_500hpa
"""

from pydantic import BaseModel, Field
from typing import Optional


class ModelFeatures(BaseModel):
    """9 features fed into model.pkl."""

    # ── Fetched from Open-Meteo ────────────────────────────────────────────────
    sea_surface_temp_c: float = Field(
        ..., description="Sea surface temperature (°C) — Open-Meteo"
    )
    sea_level_pressure_hpa: float = Field(
        ..., description="Sea level pressure (hPa) — Open-Meteo"
    )
    cape_jkg: float = Field(
        ..., description="Convective Available Potential Energy (J/kg) — Open-Meteo"
    )

    # ── Fetched from OpenWeatherMap ────────────────────────────────────────────
    max_wind_speed_kmh: float = Field(
        ..., description="Maximum wind speed (km/h) — OpenWeatherMap"
    )

    # ── Derived ───────────────────────────────────────────────────────────────
    cyclone_season: int = Field(
        ..., description="1 if location is in active cyclone season, else 0 — derived"
    )

    # ── Model defaults (user-overridable) ─────────────────────────────────────
    ocean_heat_content_kjcm2: float = Field(
        default=85.4, description="Ocean heat content (kJ/cm²) — default value"
    )
    wind_shear_ms: float = Field(
        default=12.3, description="Wind shear (m/s) — default value"
    )
    vorticity_850hpa: float = Field(
        default=0.00042, description="Vorticity at 850 hPa — default value"
    )
    relative_humidity_500hpa: float = Field(
        default=62.1, description="Relative humidity at 500 hPa (%) — default value"
    )


class PredictionRequest(BaseModel):
    lat: float = Field(..., ge=-90,  le=90,  description="Latitude")
    lon: float = Field(..., ge=-180, le=180, description="Longitude")

    # Optional overrides for model default parameters
    ocean_heat_content_kjcm2: Optional[float] = Field(
        default=None, description="Override default ocean heat content (kJ/cm²)"
    )
    wind_shear_ms: Optional[float] = Field(
        default=None, description="Override default wind shear (m/s)"
    )
    vorticity_850hpa: Optional[float] = Field(
        default=None, description="Override default vorticity at 850 hPa"
    )
    relative_humidity_500hpa: Optional[float] = Field(
        default=None, description="Override default relative humidity at 500 hPa (%)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "lat": 15.5,
                "lon": 82.3,
                "ocean_heat_content_kjcm2": 90.0,
                "wind_shear_ms": 8.5,
                "vorticity_850hpa": 0.00055,
                "relative_humidity_500hpa": 68.0,
            }
        }


class PredictionResult(BaseModel):
    cyclone: float = Field(..., description="Cyclone probability (0.00 – 1.00)")
    prediction_score: float = Field(
        ..., description="Raw model output rounded to 2 decimal places"
    )
    confidence: float = Field(
        ..., description="Model confidence score (0.0 – 1.0)"
    )
    confidence_pct: str = Field(
        ..., description="Confidence as percentage string e.g. '87.30%'"
    )
    probability_cyclone: float = Field(
        ..., description="Probability of cyclone class (0.0 – 1.0)"
    )
    probability_safe: float = Field(
        ..., description="Probability of no-cyclone class (0.0 – 1.0)"
    )
    verdict: str = Field(
        ..., description="Human-readable verdict string"
    )


class PredictionResponse(BaseModel):
    lat:       float
    lon:       float
    result:    PredictionResult
    features:  ModelFeatures
    timestamp: str
