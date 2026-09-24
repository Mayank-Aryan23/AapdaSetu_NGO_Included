"""
schemas.py
──────────
Request / response models.

Model input vector (11 features, exact order):
    max_temp_c, min_temp_c, historical_avg_temp_c, temp_anomaly_c,
    humidity_pct, wind_speed_kmh, cloud_cover_pct, solar_radiation_wm2,
    pressure_hpa, wet_bulb_temp_c, heat_index_c
"""

from pydantic import BaseModel, Field
from typing import Optional


class ModelFeatures(BaseModel):
    """11 features fed into model.pkl."""

    max_temp_c:            float = Field(..., description="Daily max temperature (°C)")
    min_temp_c:            float = Field(..., description="Daily min temperature (°C)")
    historical_avg_temp_c: float = Field(..., description="3-year climatological baseline (°C)")
    temp_anomaly_c:        float = Field(..., description="max_temp_c − historical_avg_temp_c")
    humidity_pct:          float = Field(..., description="Mean relative humidity (%)")
    wind_speed_kmh:        float = Field(..., description="Mean wind speed (km/h)")
    cloud_cover_pct:       float = Field(..., description="Mean cloud cover (%)")
    solar_radiation_wm2:   float = Field(default=250.0, description="Fixed default (W/m²)")
    pressure_hpa:          float = Field(..., description="Mean surface pressure (hPa)")
    wet_bulb_temp_c:       float = Field(..., description="Wet bulb temperature (°C)")
    heat_index_c:          float = Field(..., description="Feels-like heat index (°C)")


class PredictionRequest(BaseModel):
    lat: float = Field(..., ge=-90,  le=90,  description="Latitude")
    lon: float = Field(..., ge=-180, le=180, description="Longitude")

    class Config:
        json_schema_extra = {
            "example": {"lat": 24.817, "lon": 93.937}
        }


class PredictionResult(BaseModel):
    heatwave:         int   = Field(..., description="1 = heatwave, 0 = no heatwave")
    confidence:       float = Field(..., description="Model confidence score (0.0 - 1.0)")
    confidence_pct:   str   = Field(..., description="Confidence as percentage e.g. '87.3%'")
    probability_heat: float = Field(..., description="Raw probability of heatwave class")
    probability_safe: float = Field(..., description="Raw probability of no-heatwave class")
    verdict:          str   = Field(..., description="Human-readable verdict")


class PredictionResponse(BaseModel):
    lat:       float
    lon:       float
    result:    PredictionResult
    features:  ModelFeatures
    timestamp: str
