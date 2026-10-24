from app.ml.features import FEATURE_COLUMNS, engineer_features


def test_engineer_features_is_deterministic(synthetic_claims_df):
    first = engineer_features(synthetic_claims_df)
    second = engineer_features(synthetic_claims_df)
    assert list(first.columns) == FEATURE_COLUMNS
    assert first.equals(second)


def test_engineer_features_flags_new_policy_and_high_amount(synthetic_claims_df):
    df = synthetic_claims_df.copy()
    df.loc[0, "days_since_policy_start"] = 5
    df.loc[0, "claim_amount"] = 50000

    features = engineer_features(df)
    assert features.loc[0, "is_new_policy"] == 1
    assert features.loc[0, "high_claim_amount"] == 1
