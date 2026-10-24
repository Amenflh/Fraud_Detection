from app.ml.features import engineer_features
from app.ml.model import FraudModel, ModelNotTrainedError


def test_model_trains_and_predicts_on_synthetic_slice(synthetic_claims_df):
    X = engineer_features(synthetic_claims_df)
    y = synthetic_claims_df["is_fraud"]

    model = FraudModel()
    model.fit(X, y)

    risk = model.predict_risk(X.iloc[[0]])
    assert 0.0 <= risk.risk_score <= 1.0
    assert risk.model_used in {"ensemble", "isolation_forest"}


def test_model_save_and_load_round_trip(tmp_path, synthetic_claims_df):
    X = engineer_features(synthetic_claims_df)
    y = synthetic_claims_df["is_fraud"]

    model = FraudModel()
    model.fit(X, y)
    model.save(tmp_path)

    loaded = FraudModel.load(tmp_path)
    risk = loaded.predict_risk(X.iloc[[0]])
    assert 0.0 <= risk.risk_score <= 1.0


def test_predict_risk_without_training_raises(tmp_path):
    try:
        FraudModel.load(tmp_path)
        assert False, "expected ModelNotTrainedError"
    except ModelNotTrainedError:
        pass
