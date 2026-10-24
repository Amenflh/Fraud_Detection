"""CLI: trains the FraudModel and persists artifacts to data/models/.

Usage:
    python -m app.ml.train [--data-path PATH] [--test-size 0.2] [--random-state 42]
"""
import argparse
from pathlib import Path

import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.model_selection import train_test_split

from app.config import get_settings
from app.ml.features import engineer_features
from app.ml.model import FraudModel

DEFAULT_PROCESSED = Path("data/processed/claims.csv")
DEFAULT_SYNTHETIC = Path("data/synthetic/claims.csv")


def _resolve_data_path(explicit: Path | None) -> Path:
    if explicit is not None:
        return explicit
    if DEFAULT_PROCESSED.exists():
        return DEFAULT_PROCESSED
    if DEFAULT_SYNTHETIC.exists():
        return DEFAULT_SYNTHETIC
    raise SystemExit(
        "No dataset found. Run `python scripts/generate_synthetic_data.py` "
        "or `python scripts/download_kaggle_dataset.py` followed by `python scripts/build_features.py`."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-path", type=Path, default=None)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()

    data_path = _resolve_data_path(args.data_path)
    print(f"Loading dataset: {data_path}")
    df = pd.read_csv(data_path)

    has_labels = "is_fraud" in df.columns
    y = df["is_fraud"] if has_labels else None

    X = engineer_features(df)

    stratify = y if has_labels and y.nunique() > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.random_state, stratify=stratify
    )

    model = FraudModel()
    model.fit(X_train, y_train, random_state=args.random_state)

    settings = get_settings()
    model.save(settings.model_artifact_dir)
    print(f"Saved model artifacts to {settings.model_artifact_dir}")

    if model.xgb_model is not None and y_test is not None:
        proba = model.xgb_model.predict_proba(X_test)[:, 1]
        preds = (proba >= 0.5).astype(int)
        print("\n--- XGBoost holdout evaluation ---")
        print(classification_report(y_test, preds))
        print("ROC-AUC:", round(roc_auc_score(y_test, proba), 4))
        print("Confusion matrix:\n", confusion_matrix(y_test, preds))
    else:
        print("\nNo supervised evaluation available (labels missing or single-class).")


if __name__ == "__main__":
    main()
