"""
historical_avg_temp.py
──────────────────────
Async version of the user's historical_avg_temp.py.

Fetches historical_avg_temp_c and computes temp_anomaly_c
using the Open-Meteo ERA5 archive API (free, no key needed).

Strategy: for a given (lat, lon, date), pull the same ±2-day window
from the past 3 years and average the daily mean temperatures.

    historical_avg_temp_c = mean(daily temp_mean_c over ±2 days × 3 years)
    temp_anomaly_c        = max_temp_c − historical_avg_temp_c
"""

import httpx
from datetime import date, timedelta
from statistics import mean as stat_mean


ARCHIVE_URL  = "https://archive-api.open-meteo.com/v1/archive"
YEARS_BACK   = 3
WINDOW_DAYS  = 2


async def get_historical_avg_temp(
    lat: float,
    lon: float,
    target_date: date,
    years_back: int = YEARS_BACK,
    window_days: int = WINDOW_DAYS,
) -> dict:
    """
    Returns:
        {
            "historical_avg_temp_c": float,
            "years_used":            [int, ...],
            "window":                str,
            "yearly_means":          {year: float},
        }
    """
    yearly_means = {}

    async with httpx.AsyncClient(timeout=15.0) as client:
        for years_ago in range(1, years_back + 1):
            year = target_date.year - years_ago

            try:
                window_start = date(year, target_date.month, target_date.day) - timedelta(days=window_days)
                window_end   = date(year, target_date.month, target_date.day) + timedelta(days=window_days)
            except ValueError:
                # Feb 29 on non-leap year → Feb 28
                window_start = date(year, 2, 28) - timedelta(days=window_days)
                window_end   = date(year, 2, 28) + timedelta(days=window_days)

            temps = await _fetch_daily_mean_temps(client, lat, lon, window_start, window_end)
            if temps:
                yearly_means[year] = round(stat_mean(temps), 2)

    if not yearly_means:
        raise RuntimeError(
            f"Could not fetch historical data for ({lat}, {lon}) "
            f"around {target_date} for any of the past {years_back} years."
        )

    historical_avg = round(stat_mean(yearly_means.values()), 2)
    window_label = (
        f"{(target_date - timedelta(days=window_days)).strftime('%b %d')} – "
        f"{(target_date + timedelta(days=window_days)).strftime('%b %d')}"
    )

    return {
        "historical_avg_temp_c": historical_avg,
        "years_used":            sorted(yearly_means.keys()),
        "window":                window_label,
        "yearly_means":          yearly_means,
    }


async def get_temp_anomaly(
    lat: float,
    lon: float,
    target_date: date,
    current_max_temp_c: float,
    years_back: int = YEARS_BACK,
    window_days: int = WINDOW_DAYS,
) -> dict:
    """
    Full pipeline: historical baseline + anomaly.

    Uses max_temp_c (not mean) as the current observation,
    matching IMD heatwave definition which is based on max temp.

    Returns:
        {
            "historical_avg_temp_c": float,
            "temp_anomaly_c":        float,   # max_temp_c − historical_avg
            "years_used":            [int],
            "window":                str,
            "yearly_means":          {year: float},
        }
    """
    historical = await get_historical_avg_temp(lat, lon, target_date, years_back, window_days)
    anomaly = round(current_max_temp_c - historical["historical_avg_temp_c"], 2)

    return {
        "historical_avg_temp_c": historical["historical_avg_temp_c"],
        "temp_anomaly_c":        anomaly,
        "years_used":            historical["years_used"],
        "window":                historical["window"],
        "yearly_means":          historical["yearly_means"],
    }


async def _fetch_daily_mean_temps(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    start: date,
    end: date,
) -> list:
    params = {
        "latitude":   lat,
        "longitude":  lon,
        "start_date": start.isoformat(),
        "end_date":   end.isoformat(),
        "daily":      "temperature_2m_mean,temperature_2m_max,temperature_2m_min",
        "timezone":   "auto",
    }
    try:
        resp = await client.get(ARCHIVE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  [warn] archive API failed for {start}–{end}: {e}")
        return []

    daily      = data.get("daily", {})
    mean_temps = daily.get("temperature_2m_mean", [])
    max_temps  = daily.get("temperature_2m_max",  [])
    min_temps  = daily.get("temperature_2m_min",  [])

    results = []
    for i in range(len(mean_temps)):
        val = mean_temps[i]
        if val is None and i < len(max_temps) and i < len(min_temps):
            if max_temps[i] is not None and min_temps[i] is not None:
                val = (max_temps[i] + min_temps[i]) / 2
        if val is not None:
            results.append(val)

    return results
