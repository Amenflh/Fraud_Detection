from functools import lru_cache

import pandas as pd

from app.agents.state import FraudInvestigationState
from app.config import get_settings
from app.ml.model import FraudModel, ModelNotTrainedError
from app.schemas import RiskAssessment


@lru_cache
def _load_model() -> FraudModel | None:
    settings = get_settings()
    try:
        return FraudModel.load(settings.model_artifact_dir)
    except ModelNotTrainedError:
        return None


def run(state: FraudInvestigationState) -> dict:
    errors = list(state.get("errors", []))
    settings = get_settings()

    model = _load_model()
    if model is None:
        errors.append(
            "No trained model found. Run `python -m app.ml.train` for real risk scoring; "
            "using a neutral fallback score for now."
        )
        risk_assessment = RiskAssessment(risk_score=0.5, is_anomaly=False, model_used="none")
        return {"risk_assessment": risk_assessment, "errors": errors}

    features_df = pd.DataFrame([state["features"]])
    risk_assessment = model.predict_risk(features_df, threshold=settings.fraud_score_threshold)
    return {"risk_assessment": risk_assessment, "errors": errors}
