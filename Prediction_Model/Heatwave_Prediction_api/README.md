# 🌡️ Heatwave Prediction API

A production-ready REST API that predicts heatwave risk from geographic coordinates using real-time weather data and a trained Random Forest model.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)](https://fastapi.tiangolo.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## How It Works

```
lat + lon
   │
   ├── OpenWeatherMap 2.5  →  max_temp, min_temp, humidity,
   │                          wind_speed, cloud_cover, pressure
   │
   ├── Open-Meteo          →  wet_bulb_temperature
   │
   ├── ERA5 Archive        →  historical_avg_temp, temp_anomaly
   │                          (3-year ±2 day climatological baseline)
   │
   └── Computed locally    →  heat_index (Rothfusz equation)
                               solar_radiation (fixed default: 250 W/m²)
                                      │
                                 model.pkl
                            (RandomForestClassifier)
                                      │
                             heatwave: 0 or 1
                           + confidence score
```

## Setup

### 1. Clone
```bash
git clone https://github.com/YOUR_USERNAME/heatwave-api.git
cd heatwave-api
```

### 2. Virtual environment
```bash
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment variables
```bash
cp .env.example .env
# Edit .env and add your OpenWeatherMap API key
```

### 4. Add your model
```bash
cp /path/to/your/model.pkl .
```

### 5. Run
```bash
python main.py
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

---

## API Reference

### `GET /predict`
```bash
curl "http://localhost:8000/predict?lat=24.817&lon=93.937"
```

### `POST /predict`
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"lat": 24.817, "lon": 93.937}'
```

### Response
```json
{
  "lat": 24.817,
  "lon": 93.937,
  "result": {
    "heatwave": 1,
    "confidence": 0.873,
    "confidence_pct": "87.3%",
    "probability_heat": 0.873,
    "probability_safe": 0.127,
    "verdict": "HEATWAVE PREDICTED (87.3% confidence)"
  },
  "features": {
    "max_temp_c": 42.1,
    "min_temp_c": 27.3,
    "historical_avg_temp_c": 33.8,
    "temp_anomaly_c": 8.3,
    "humidity_pct": 68.0,
    "wind_speed_kmh": 11.2,
    "cloud_cover_pct": 25.0,
    "solar_radiation_wm2": 250.0,
    "pressure_hpa": 1005.3,
    "wet_bulb_temp_c": 31.4,
    "heat_index_c": 49.2
  },
  "timestamp": "2025-05-15T09:00:00Z"
}
```

### All endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API info |
| GET | `/health` | Health check |
| GET | `/predict?lat=&lon=` | Predict heatwave |
| POST | `/predict` | Predict heatwave (JSON body) |
| GET | `/features?lat=&lon=` | Raw features (debug) |
| GET | `/docs` | Swagger UI |

---

## Model Features

| Feature | Source | Notes |
|---------|--------|-------|
| `max_temp_c` | OpenWeatherMap forecast | Kelvin → °C |
| `min_temp_c` | OpenWeatherMap forecast | Kelvin → °C |
| `historical_avg_temp_c` | ERA5 archive | 3-year ±2 day window |
| `temp_anomaly_c` | Computed | max_temp − historical_avg |
| `humidity_pct` | OpenWeatherMap hourly | Mean next 24h |
| `wind_speed_kmh` | OpenWeatherMap hourly | m/s → km/h |
| `cloud_cover_pct` | OpenWeatherMap hourly | Mean next 24h |
| `solar_radiation_wm2` | Fixed default | 250.0 W/m² |
| `pressure_hpa` | OpenWeatherMap hourly | Mean next 24h |
| `wet_bulb_temp_c` | Open-Meteo | Daily mean |
| `heat_index_c` | Computed | Rothfusz equation |

---

## Deploy to Render (free)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo
4. Set environment variable: `OPENWEATHER_API_KEY=your_key`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Deploy with Docker

```bash
docker build -t heatwave-api .
docker run -p 8000:8000 --env-file .env -v $(pwd)/model.pkl:/api/model.pkl heatwave-api
```

---

## Project Structure

```
heatwave-api/
├── .env                  ← your secrets (not committed)
├── .env.example          ← template (committed)
├── .gitignore
├── model.pkl             ← your trained model (not committed)
├── main.py               ← entry point
├── requirements.txt
├── Dockerfile
├── README.md
└── app/
    ├── config.py         ← loads .env settings
    ├── main.py           ← FastAPI routes
    ├── model.py          ← loads pkl, returns confidence
    ├── weather.py        ← all API fetching
    ├── historical_avg_temp.py  ← ERA5 baseline
    └── schemas.py        ← request/response types
```

---

## License
MIT
