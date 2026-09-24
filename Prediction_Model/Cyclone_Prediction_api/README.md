# Cyclone Prediction API

Predicts cyclone risk from latitude & longitude using live weather data + your trained model.

## Project Structure

```
cyclone-api/
├── main.py                 ← entry point  (python main.py)
├── model.pkl               ← put YOUR trained model here
├── requirements.txt
├── Dockerfile
├── .env.example
├── .gitignore
└── app/
    ├── __init__.py
    ├── main.py             ← FastAPI routes
    ├── schemas.py          ← Pydantic request / response models
    ├── weather.py          ← Open-Meteo + OpenWeather + cyclone season
    ├── model.py            ← loads model.pkl, runs inference
    └── config.py           ← env settings
```

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# → edit .env and add your OpenWeatherMap API key

# 3. Drop your trained model
cp /path/to/your/model.pkl model.pkl

# 4. Run
python main.py
# or
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Swagger UI → http://localhost:8000/docs

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API info |
| GET | `/health` | Health + model status |
| GET | `/predict?lat=&lon=` | Predict with defaults |
| POST | `/predict` | Predict with optional overrides |
| GET | `/features?lat=&lon=` | Debug: raw features, no inference |

---

## API Usage

### GET — minimal (uses all defaults)
```
GET /predict?lat=15.5&lon=82.3
```

### POST — with default overrides
```json
POST /predict
{
  "lat": 15.5,
  "lon": 82.3,
  "ocean_heat_content_kjcm2": 90.0,
  "wind_shear_ms": 8.5,
  "vorticity_850hpa": 0.00055,
  "relative_humidity_500hpa": 68.0
}
```

### Response
```json
{
  "lat": 15.5,
  "lon": 82.3,
  "result": {
    "cyclone": 1,
    "prediction_score": 0.78,
    "confidence": 0.78,
    "confidence_pct": "78.00%",
    "probability_cyclone": 0.78,
    "probability_safe": 0.22,
    "verdict": "CYCLONE PREDICTED (78.00% confidence)"
  },
  "features": {
    "sea_surface_temp_c": 29.4,
    "sea_level_pressure_hpa": 1004.2,
    "cape_jkg": 1840.0,
    "max_wind_speed_kmh": 67.3,
    "cyclone_season_active": 1,
    "ocean_heat_content_kjcm2": 90.0,
    "wind_shear_ms": 8.5,
    "vorticity_850hpa": 0.00055,
    "relative_humidity_500hpa": 68.0
  },
  "timestamp": "2026-04-27T10:00:00Z"
}
```

---

## Features & Sources

| Feature | Source | Notes |
|---------|--------|-------|
| `sea_surface_temp_c` | Open-Meteo | `temperature_2m` current |
| `sea_level_pressure_hpa` | Open-Meteo | `surface_pressure` current |
| `cape_jkg` | Open-Meteo | `cape` current |
| `max_wind_speed_kmh` | OpenWeatherMap | max over next 24 h, m/s → km/h |
| `cyclone_season_active` | Derived | 1 if in active season for that lat |
| `ocean_heat_content_kjcm2` | Default: 85.4 | overridable in POST body |
| `wind_shear_ms` | Default: 12.3 | overridable in POST body |
| `vorticity_850hpa` | Default: 0.00042 | overridable in POST body |
| `relative_humidity_500hpa` | Default: 62.1 | overridable in POST body |

---

## Plugging in Your Model

Open `app/model.py` and check:

1. **`FEATURE_ORDER`** list — must match column order from training.
2. **Classifier vs regressor** — both paths are handled automatically:
   - If your model has `predict_proba` → uses `proba[1]` as cyclone probability.
   - If regressor returning 0.00–1.00 → treats output directly as score.
3. **Threshold** — default is `>= 0.50` for `cyclone = 1`. Adjust in `model.py`.
4. **Verdict tiers** — confidence bands (85%, 65%) in `model.py` → tune as needed.

---

## Docker

```bash
docker build -t cyclone-api .
docker run -p 8000:8000 \
  -v $(pwd)/model.pkl:/api/model.pkl \
  --env-file .env \
  cyclone-api
```
