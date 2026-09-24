"""
weather.py
──────────
Fetches all live weather features needed by the model.

Sources
───────
  OpenWeatherMap FREE APIs (no One Call 3.0 needed)
    /data/2.5/weather  (current)
      → humidity_pct, wind_speed_kmh, cloud_cover_pct, pressure_hpa
      → temp_c (current, used as proxy for min)

    /data/2.5/forecast (3h intervals, free)
      → max_temp_c  (max over next 24h slots)
      → min_temp_c  (min over next 24h slots)
      → humidity_pct, wind, cloud, pressure (mean over next 24h)

  Open-Meteo Forecast API (free, no key)
    → wet_bulb_temp_c               (daily mean)

  historical_avg_temp.py (ERA5 archive, free, no key)
    → historical_avg_temp_c
    → temp_anomaly_c

  Computed locally
    → heat_index_c                  (Rothfusz equation)
    → solar_radiation_wm2           (fixed default: 250.0)
"""

import httpx
import math
from datetime import date, datetime
from typing import Optional

from app.historical_avg_temp import get_temp_anomaly
from app.schemas import ModelFeatures


# ── Constants ─────────────────────────────────────────────────────────────────

OWM_CURRENT_URL  = "https://api.openweathermap.org/data/2.5/weather"
OWM_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"
OPEN_METEO_URL   = "https://api.open-meteo.com/v1/forecast"

SOLAR_RADIATION_DEFAULT = 250.0  # W/m² — fixed default as instructed


# ── Helpers ───────────────────────────────────────────────────────────────────

def kelvin_to_celsius(k: float) -> float:
    return round(k - 273.15, 2)


def ms_to_kmh(ms: float) -> float:
    return round(ms * 3.6, 2)


def safe_mean(values: list) -> float:
    valid = [v for v in values if v is not None]
    return round(sum(valid) / len(valid), 2) if valid else 0.0


def compute_heat_index(temp_c: float, rh: float) -> float:
    """
    Rothfusz heat index (NWS). Valid for temp >= 27°C and RH >= 40%.
    Returns temp_c unchanged if conditions not met.
    """
    if temp_c < 27 or rh < 40:
        return temp_c

    t = temp_c * 9 / 5 + 32  # °F
    hi = (
        -42.379
        + 2.04901523  * t
        + 10.14333127 * rh
        - 0.22475541  * t * rh
        - 0.00683783  * t ** 2
        - 0.05481717  * rh ** 2
        + 0.00122874  * t ** 2 * rh
        + 0.00085282  * t * rh ** 2
        - 0.00000199  * t ** 2 * rh ** 2
    )
    return round((hi - 32) * 5 / 9, 2)  # back to °C


# ── OpenWeatherMap (free 2.5 APIs) ────────────────────────────────────────────

async def fetch_openweather(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    api_key: str,
) -> dict:
    """
    Uses only the FREE OWM 2.5 endpoints — no One Call 3.0 needed.

    /data/2.5/forecast  → 3h intervals for next 5 days
        max_temp_c      = max of temp_max across next 8 slots (24h)
        min_temp_c      = min of temp_min across next 8 slots (24h)
        humidity_pct    = mean humidity across next 8 slots
        wind_speed_kmh  = mean wind_speed (m/s → km/h) across next 8 slots
        cloud_cover_pct = mean clouds.all across next 8 slots
        pressure_hpa    = mean pressure across next 8 slots
    """
    params = {
        "lat":   lat,
        "lon":   lon,
        "appid": api_key,
        "cnt":   8,         # next 8 × 3h = 24h of data
        "units": "standard" # Kelvin for temp
    }

    resp = await client.get(OWM_FORECAST_URL, params=params, timeout=15.0)
    resp.raise_for_status()
    data = resp.json()

    slots = data.get("list", [])

    # Temperature: Kelvin → °C
    temps_max = [kelvin_to_celsius(s["main"]["temp_max"]) for s in slots if "main" in s]
    temps_min = [kelvin_to_celsius(s["main"]["temp_min"]) for s in slots if "main" in s]
    humidity_list   = [s["main"].get("humidity")          for s in slots if "main" in s]
    wind_list       = [s.get("wind", {}).get("speed", 0)  for s in slots]  # m/s
    cloud_list      = [s.get("clouds", {}).get("all", 0)  for s in slots]
    pressure_list   = [s["main"].get("pressure")          for s in slots if "main" in s]

    max_temp_c      = round(max(temps_max), 2) if temps_max else 30.0
    min_temp_c      = round(min(temps_min), 2) if temps_min else 20.0
    humidity_pct    = safe_mean(humidity_list)
    wind_speed_kmh  = ms_to_kmh(safe_mean(wind_list))
    cloud_cover_pct = safe_mean(cloud_list)
    pressure_hpa    = safe_mean(pressure_list)

    return {
        "max_temp_c":      max_temp_c,
        "min_temp_c":      min_temp_c,
        "humidity_pct":    humidity_pct,
        "wind_speed_kmh":  wind_speed_kmh,
        "cloud_cover_pct": cloud_cover_pct,
        "pressure_hpa":    pressure_hpa,
    }


# ── Open-Meteo → Wet Bulb ─────────────────────────────────────────────────────

async def fetch_wet_bulb(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
) -> float:
    """
    Fetches wet_bulb_temperature_2m_mean from Open-Meteo forecast API (free).
    Falls back to 25.0 if unavailable.
    """
    params = {
        "latitude":      lat,
        "longitude":     lon,
        "daily":         "wet_bulb_temperature_2m_mean",
        "forecast_days": 1,
        "timezone":      "auto",
    }

    try:
        resp = await client.get(OPEN_METEO_URL, params=params, timeout=15.0)
        resp.raise_for_status()
        data = resp.json()
        values = data.get("daily", {}).get("wet_bulb_temperature_2m_mean", [])
        if values and values[0] is not None:
            return round(float(values[0]), 2)
    except Exception as e:
        print(f"  [warn] wet_bulb fetch failed: {e}")

    return 25.0  # safe fallback


# ── Main fetch entry point ─────────────────────────────────────────────────────

async def fetch_all_features(
    lat: float,
    lon: float,
    openweather_api_key: str,
) -> ModelFeatures:
    """
    Orchestrates all API calls and returns a ModelFeatures instance
    ready to be passed to the model.

    Call order:
      1. OpenWeatherMap    → max/min temp, humidity, wind, cloud, pressure
      2. Open-Meteo seasonal → wet_bulb_temp_c
      3. ERA5 archive      → historical_avg_temp_c, temp_anomaly_c
      4. Local compute     → heat_index_c
      5. Default           → solar_radiation_wm2 = 250.0
    """
    today = date.today()

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. OpenWeatherMap
        owm = await fetch_openweather(client, lat, lon, openweather_api_key)

        # 2. Wet bulb (Open-Meteo seasonal)
        wet_bulb = await fetch_wet_bulb(client, lat, lon)

    # 3. Historical baseline + anomaly (ERA5 archive, opens its own client)
    hist = await get_temp_anomaly(
        lat=lat,
        lon=lon,
        target_date=today,
        current_max_temp_c=owm["max_temp_c"],
    )

    # 4. Heat index (computed from max_temp + humidity)
    heat_index = compute_heat_index(owm["max_temp_c"], owm["humidity_pct"])

    # 5. Assemble
    return ModelFeatures(
        max_temp_c            = owm["max_temp_c"],
        min_temp_c            = owm["min_temp_c"],
        historical_avg_temp_c = hist["historical_avg_temp_c"],
        temp_anomaly_c        = hist["temp_anomaly_c"],
        humidity_pct          = owm["humidity_pct"],
        wind_speed_kmh        = owm["wind_speed_kmh"],
        cloud_cover_pct       = owm["cloud_cover_pct"],
        solar_radiation_wm2   = SOLAR_RADIATION_DEFAULT,
        pressure_hpa          = owm["pressure_hpa"],
        wet_bulb_temp_c       = wet_bulb,
        heat_index_c          = heat_index,
    )
