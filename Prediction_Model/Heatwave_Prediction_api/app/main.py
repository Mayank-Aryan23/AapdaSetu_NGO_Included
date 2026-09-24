"""
app/main.py
───────────
FastAPI routes. API key is loaded from .env — not passed in URLs.

Endpoints:
    GET  /              health check
    GET  /health
    GET  /predict       ?lat=&lon=
    POST /predict       JSON body: {"lat": ..., "lon": ...}
    GET  /features      ?lat=&lon=   (debug — raw features, no model)
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import logging

from app.config import settings
from app.schemas import PredictionRequest, PredictionResponse, ModelFeatures
from app.weather import fetch_all_features
from app.model import HeatwaveModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Heatwave Prediction API",
    description=(
        "Predicts heatwave risk from latitude & longitude.\n\n"
        "**Sources:**\n"
        "- OpenWeatherMap 2.5 (temp, humidity, wind, cloud, pressure)\n"
        "- Open-Meteo (wet bulb temperature)\n"
        "- ERA5 Archive (historical baseline & anomaly)\n\n"
        "**Output:** `heatwave: 0 or 1` + confidence score"
    ),
    version="2.1.0",
    contact={
        "name": "Heatwave AI",
    },
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = HeatwaveModel()


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"], summary="API info")
async def root():
    return {
        "service":  "Heatwave Prediction API",
        "version":  "2.1.0",
        "status":   "running",
        "docs":     "/docs",
        "endpoints": {
            "predict_get":  "GET  /predict?lat=&lon=",
            "predict_post": "POST /predict  {lat, lon}",
            "features":     "GET  /features?lat=&lon=  (debug)",
            "health":       "GET  /health",
        },
    }


@app.get("/health", tags=["Health"])
async def health():
    return {
        "status":       "healthy",
        "model_loaded": model.is_loaded,
        "api_key_set":  bool(settings.openweather_api_key),
    }


@app.get(
    "/predict",
    response_model=PredictionResponse,
    tags=["Prediction"],
    summary="Predict heatwave — GET",
)
async def predict_get(
    lat: float = Query(..., ge=-90,  le=90,  description="Latitude",  example=24.817),
    lon: float = Query(..., ge=-180, le=180, description="Longitude", example=93.937),
):
    """
    Returns heatwave prediction for the given coordinates.
    API key is loaded from server environment — no need to pass it.
    """
    return await _predict(lat, lon)


@app.post(
    "/predict",
    response_model=PredictionResponse,
    tags=["Prediction"],
    summary="Predict heatwave — POST",
)
async def predict_post(req: PredictionRequest):
    """Same as GET but accepts a JSON body `{"lat": ..., "lon": ...}`."""
    return await _predict(req.lat, req.lon)


@app.get(
    "/features",
    response_model=ModelFeatures,
    tags=["Debug"],
    summary="Raw features (no model)",
)
async def get_features(
    lat: float = Query(..., ge=-90,  le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """Returns the 11 features that would be fed into the model."""
    try:
        return await fetch_all_features(lat, lon, settings.openweather_api_key)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── Internal ──────────────────────────────────────────────────────────────────

async def _predict(lat: float, lon: float) -> PredictionResponse:
    logger.info(f"Prediction request: lat={lat}, lon={lon}")

    try:
        features = await fetch_all_features(lat, lon, settings.openweather_api_key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Weather fetch failed: {e}")

    try:
        result = model.predict(features)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model error: {e}")

    return PredictionResponse(
        lat       = lat,
        lon       = lon,
        result    = result,
        features  = features,
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
