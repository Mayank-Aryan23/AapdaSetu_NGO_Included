import os
import numpy as np
import joblib
from app.schemas import ModelFeatures, PredictionResult

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "model.pkl")

class HeatwaveModel:
    def __init__(self):
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"model.pkl not found at {os.path.abspath(MODEL_PATH)}.")
        self.clf = joblib.load(MODEL_PATH)
        self.is_loaded = True
        print(f"[model] Loaded: {type(self.clf).__name__}")

    def _to_vector(self, f: ModelFeatures) -> np.ndarray:
        return np.array([[
            f.max_temp_c, f.min_temp_c, f.historical_avg_temp_c,
            f.temp_anomaly_c, f.humidity_pct, f.wind_speed_kmh,
            f.cloud_cover_pct, f.solar_radiation_wm2, f.pressure_hpa,
            f.wet_bulb_temp_c, f.heat_index_c,
        ]], dtype=np.float32)

    def predict(self, features: ModelFeatures) -> PredictionResult:
        vec = self._to_vector(features)
        if hasattr(self.clf, "predict_proba"):
            proba = self.clf.predict_proba(vec)[0]
            prob_heat = float(proba[1])
            prob_safe = float(proba[0])
            heatwave  = 1 if prob_heat >= 0.5 else 0
            confidence = float(max(prob_heat, prob_safe))
        else:
            heatwave   = int(self.clf.predict(vec)[0])
            prob_heat  = float(heatwave)
            prob_safe  = 1.0 - prob_heat
            confidence = 1.0

        confidence_pct = f"{confidence * 100:.1f}%"
        verdict = f"HEATWAVE PREDICTED ({confidence_pct} confidence)" if heatwave == 1 else f"No heatwave ({confidence_pct} confidence)"

        return PredictionResult(
            heatwave=heatwave, confidence=round(confidence, 4),
            confidence_pct=confidence_pct, probability_heat=round(prob_heat, 4),
            probability_safe=round(prob_safe, 4), verdict=verdict,
        )
