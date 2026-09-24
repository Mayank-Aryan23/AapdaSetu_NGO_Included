"""
weather.py
──────────
Fetches all live weather features needed by the cyclone model.

Sources
───────
  Open-Meteo Forecast API (free, no key needed)
    → sea_surface_temp_c       (temperature_2m current as proxy;
                                 swap to marine SST endpoint if available)
    → sea_level_pressure_hpa   (surface_pressure current)
    → cape_jkg                 (cape current)

  OpenWeatherMap FREE 2.5 API
    → max_wind_speed_kmh       (wind.speed m/s → km/h, max over 24h slots)

  Derived locally
    → cyclone_season_active    (1 or 0, based on lat + current month)

  Model defaults (passed through from request, not fetched)
    → ocean_heat_content_kjcm2
    → wind_shear_ms
    → vorticity_850hpa
    → relative_humidity_500hpa
"""

import httpx
from datetime import datetime
from app.schemas import ModelFeatures, PredictionRequest


# ── API endpoints ─────────────────────────────────────────────────────────────

OPEN_METEO_URL   = "https://api.open-meteo.com/v1/forecast"
OWM_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"


# ── Helpers ───────────────────────────────────────────────────────────────────

def ms_to_kmh(ms: float) -> float:
    return round(ms * 3.6, 2)


def safe_max(values: list, fallback: float = 20.0) -> float:
    valid = [v for v in values if v is not None]
    return round(max(valid), 2) if valid else fallback


# ── Open-Meteo: SST proxy, SLP, CAPE ─────────────────────────────────────────

async def fetch_openmeteo(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
) -> dict:
    """
    Fetches current atmospheric variables from Open-Meteo (free, no key).

    Fields returned:
      temperature_2m    → sea_surface_temp_c  (near-surface proxy)
      surface_pressure  → sea_level_pressure_hpa
      cape              → cape_jkg

    Note: Open-Meteo's marine endpoint provides true SST. If your model
    was trained on marine SST, swap to:
      https://marine-api.open-meteo.com/v1/marine
      with variable: sea_surface_temperature
    """
    params = {
        "latitude":      lat,
        "longitude":     lon,
        "current":       "temperature_2m,surface_pressure,cape",
        "timezone":      "auto",
        "forecast_days": 1,
    }

    resp = await client.get(OPEN_METEO_URL, params=params, timeout=15.0)
    resp.raise_for_status()
    data = resp.json()

    current = data.get("current", {})

    sst  = current.get("temperature_2m")
    slp  = current.get("surface_pressure")
    cape = current.get("cape")

    return {
        "sea_surface_temp_c":     round(float(sst),  2) if sst  is not None else 28.0,
        "sea_level_pressure_hpa": round(float(slp),  2) if slp  is not None else 1008.0,
        "cape_jkg":               round(float(cape), 2) if cape is not None else 500.0,
    }


# ── OpenWeatherMap: max wind speed ────────────────────────────────────────────

async def fetch_openweather(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    api_key: str,
) -> dict:
    """
    Uses OWM /data/2.5/forecast (free tier — no One Call 3.0 needed).
    Fetches next 8 × 3h slots (24h) and takes the max wind speed.

    wind.speed is in m/s → converted to km/h.
    """
    params = {
        "lat":   lat,
        "lon":   lon,
        "appid": api_key,
        "cnt":   8,          # next 8 slots = 24 h
        "units": "standard", # wind in m/s
    }

    resp = await client.get(OWM_FORECAST_URL, params=params, timeout=15.0)
    resp.raise_for_status()
    data = resp.json()

    slots = data.get("list", [])
    wind_speeds_ms = [
        s.get("wind", {}).get("speed", 0.0) for s in slots
    ]

    max_wind_kmh = ms_to_kmh(safe_max(wind_speeds_ms, fallback=5.56))  # ~20 km/h default

    return {
        "max_wind_speed_kmh": max_wind_kmh,
    }


# ── Cyclone season derivation ─────────────────────────────────────────────────

def derive_cyclone_season(lat: float) -> int:
    """
    Returns 1 if the location is inside an active cyclone season, else 0.

    Basin rules used:
      North Indian Ocean (Bay of Bengal / Arabian Sea):  lat  5°N – 25°N → Apr – Dec
      South Indian Ocean / South Pacific:                lat  5°S – 25°S → Nov – Apr
      Western North Pacific:                             lat  5°N – 35°N → May – Nov
      Atlantic / Eastern Pacific (informational):        lat  5°N – 35°N → Jun – Nov

    For locations outside the 5°–35° tropical belt, returns 0.
    """
    month   = datetime.now().month
    abs_lat = abs(lat)

    if abs_lat < 5 or abs_lat > 35:
        return 0

    if lat > 0:  # Northern Hemisphere
        # North Indian Ocean peak: April – December
        return 1 if 4 <= month <= 12 else 0
    else:        # Southern Hemisphere
        # South Indian Ocean / South Pacific: November – April
        return 1 if (month >= 11 or month <= 4) else 0


# ── Master fetch ──────────────────────────────────────────────────────────────

async def fetch_all_features(
    lat: float,
    lon: float,
    openweather_api_key: str,
    request: PredictionRequest,
) -> ModelFeatures:
    """
    Orchestrates all API calls and returns a ModelFeatures instance
    ready to be passed to the cyclone model.

    Call order:
      1. Open-Meteo   → sea_surface_temp_c, sea_level_pressure_hpa, cape_jkg
      2. OpenWeather  → max_wind_speed_kmh
      3. Derived      → cyclone_season_active
      4. Defaults     → ocean_heat_content_kjcm2, wind_shear_ms,
                        vorticity_850hpa, relative_humidity_500hpa
                        (from request body — user can override)
    """
    async with httpx.AsyncClient(timeout=20.0) as client:
        om_data  = await fetch_openmeteo(client, lat, lon)
        owm_data = await fetch_openweather(client, lat, lon, openweather_api_key)

    cyclone_season = derive_cyclone_season(lat)

    return ModelFeatures(
        # ── Live fetched ──────────────────────────────────────────────────────
        sea_surface_temp_c     = om_data["sea_surface_temp_c"],
        sea_level_pressure_hpa = om_data["sea_level_pressure_hpa"],
        cape_jkg               = om_data["cape_jkg"],
        max_wind_speed_kmh     = owm_data["max_wind_speed_kmh"],

        # ── Derived ───────────────────────────────────────────────────────────
        cyclone_season  = cyclone_season,

        # ── Model defaults (override from request if provided) ────────────────
        ocean_heat_content_kjcm2 = (
            request.ocean_heat_content_kjcm2
            if request.ocean_heat_content_kjcm2 is not None
            else 85.4
        ),
        wind_shear_ms = (
            request.wind_shear_ms
            if request.wind_shear_ms is not None
            else 12.3
        ),
        vorticity_850hpa = (
            request.vorticity_850hpa
            if request.vorticity_850hpa is not None
            else 0.00042
        ),
        relative_humidity_500hpa = (
            request.relative_humidity_500hpa
            if request.relative_humidity_500hpa is not None
            else 62.1
        ),
    )
