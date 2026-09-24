import os
import numpy as np
import joblib
import xgboost as xgb

from app.schemas import ModelFeatures, PredictionResult


MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "model.pkl")

FEATURE_ORDER = [
    "sea_surface_temp_c",
    "ocean_heat_content_kjcm2",
    "wind_shear_ms",
    "sea_level_pressure_hpa",
    "vorticity_850hpa",
    "cape_jkg",
    "relative_humidity_500hpa",
    "max_wind_speed_kmh",
    "cyclone_season",
]


class CycloneModel:
    def __init__(self):
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"model.pkl not found at {os.path.abspath(MODEL_PATH)}."
            )
        obj = joblib.load(MODEL_PATH)
        self.clf = obj['model'] if isinstance(obj, dict) else obj
        self.is_loaded = True
        print(f"[model] Loaded: {type(self.clf).__name__}")

    def _to_vector(self, f: ModelFeatures) -> np.ndarray:
        return np.array([[
            getattr(f, col) for col in FEATURE_ORDER
        ]], dtype=np.float32)

    def predict(self, features: ModelFeatures) -> PredictionResult:
        vec = self._to_vector(features)
        dmatrix = xgb.DMatrix(vec, feature_names=FEATURE_ORDER)

        raw_score = float(self.clf.predict(dmatrix)[0])
        prediction_score = round(raw_score, 2)
        prob_cyclone = prediction_score
        prob_safe = round(1.0 - prediction_score, 2)
        confidence = round(abs(prediction_score - 0.5) * 2, 4)
        confidence_pct = f"{confidence * 100:.2f}%"

        if prediction_score >= 0.50:
            if confidence >= 0.85:
                verdict = f"CYCLONE HIGHLY LIKELY ({confidence_pct} confidence)"
            elif confidence >= 0.65:
                verdict = f"CYCLONE PREDICTED ({confidence_pct} confidence)"
            else:
                verdict = f"CYCLONE POSSIBLE — low confidence ({confidence_pct})"
        else:
            if confidence >= 0.85:
                verdict = f"No cyclone ({confidence_pct} confidence)"
            elif confidence >= 0.65:
                verdict = f"No cyclone predicted ({confidence_pct} confidence)"
            else:
                verdict = f"No cyclone — borderline ({confidence_pct} confidence)"

        return PredictionResult(
            cyclone             = prediction_score,
            prediction_score    = prediction_score,
            confidence          = confidence,
            confidence_pct      = confidence_pct,
            probability_cyclone = prob_cyclone,
            probability_safe    = prob_safe,
            verdict             = verdict,
        )
