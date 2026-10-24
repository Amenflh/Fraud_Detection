import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from app.schemas import RiskAssessment

try:
    from xgboost import XGBClassifier
except ImportError:  # pragma: no cover
    XGBClassifier = None


class ModelNotTrainedError(RuntimeError):
    pass


class FraudModel:
    def __init__(self) -> None:
        self.scaler: StandardScaler | None = None
        self.isolation_forest: IsolationForest | None = None
        self.xgb_model = None
        self.feature_columns: list[str] = []

    def fit(self, X: pd.DataFrame, y: pd.Series | None = None, random_state: int = 42) -> None:
        self.feature_columns = list(X.columns)

        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        self.isolation_forest = IsolationForest(random_state=random_state, contamination="auto")
        self.isolation_forest.fit(X_scaled)

        if y is not None and y.nunique() > 1 and XGBClassifier is not None:
            self.xgb_model = XGBClassifier(random_state=random_state, eval_metric="logloss")
            self.xgb_model.fit(X, y)

    def predict_risk(self, X: pd.DataFrame, threshold: float = 0.7) -> RiskAssessment:
        if self.isolation_forest is None or self.scaler is None:
            raise ModelNotTrainedError(
                "FraudModel has no trained artifacts. Run `python -m app.ml.train` first."
            )

        X = X[self.feature_columns]
        X_scaled = self.scaler.transform(X)

        iso_raw = self.isolation_forest.decision_function(X_scaled)
        # decision_function: negative = more anomalous. Map to a 0-1 risk score via a sigmoid.
        iso_score = float(1 / (1 + np.exp(iso_raw[0] * 5)))

        if self.xgb_model is not None:
            xgb_proba = float(self.xgb_model.predict_proba(X)[0][1])
            risk_score = 0.5 * iso_score + 0.5 * xgb_proba
            model_used = "ensemble"
        else:
            risk_score = iso_score
            model_used = "isolation_forest"

        return RiskAssessment(
            risk_score=round(risk_score, 4),
            is_anomaly=risk_score >= threshold,
            model_used=model_used,
        )

    def save(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.isolation_forest, directory / "isolation_forest.joblib")
        joblib.dump(self.scaler, directory / "scaler.joblib")
        if self.xgb_model is not None:
            joblib.dump(self.xgb_model, directory / "xgb_model.joblib")
        metadata = {
            "feature_columns": self.feature_columns,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "has_xgboost": self.xgb_model is not None,
        }
        (directory / "metadata.json").write_text(json.dumps(metadata, indent=2))

    @classmethod
    def load(cls, directory: Path) -> "FraudModel":
        iso_path = directory / "isolation_forest.joblib"
        scaler_path = directory / "scaler.joblib"
        metadata_path = directory / "metadata.json"
        if not (iso_path.exists() and scaler_path.exists() and metadata_path.exists()):
            raise ModelNotTrainedError(
                f"No model artifacts found in {directory}. Run `python -m app.ml.train` first."
            )

        model = cls()
        model.isolation_forest = joblib.load(iso_path)
        model.scaler = joblib.load(scaler_path)
        metadata = json.loads(metadata_path.read_text())
        model.feature_columns = metadata["feature_columns"]

        xgb_path = directory / "xgb_model.joblib"
        if metadata.get("has_xgboost") and xgb_path.exists():
            model.xgb_model = joblib.load(xgb_path)

        return model
