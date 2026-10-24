import pandas as pd

from app.schemas import ClaimInput

INCIDENT_TYPES = ["collision", "theft", "fire", "vandalism", "other"]

NUMERIC_FEATURE_COLUMNS = [
    "claim_amount",
    "days_since_policy_start",
    "prior_claims_count",
    "claim_amount_to_policy_age_ratio",
    "is_new_policy",
    "high_claim_amount",
]

FEATURE_COLUMNS = NUMERIC_FEATURE_COLUMNS + [f"incident_type_{t}" for t in INCIDENT_TYPES]

HIGH_CLAIM_AMOUNT_THRESHOLD = 15000
NEW_POLICY_DAYS_THRESHOLD = 30


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["claim_amount_to_policy_age_ratio"] = df["claim_amount"] / (
        df["days_since_policy_start"].clip(lower=1)
    )
    df["is_new_policy"] = (df["days_since_policy_start"] < NEW_POLICY_DAYS_THRESHOLD).astype(int)
    df["high_claim_amount"] = (df["claim_amount"] >= HIGH_CLAIM_AMOUNT_THRESHOLD).astype(int)

    incident_type = df["incident_type"].where(df["incident_type"].isin(INCIDENT_TYPES), "other")
    for t in INCIDENT_TYPES:
        df[f"incident_type_{t}"] = (incident_type == t).astype(int)

    return df[FEATURE_COLUMNS]


def row_to_feature_vector(claim: ClaimInput) -> pd.DataFrame:
    raw = pd.DataFrame(
        [
            {
                "claim_amount": claim.claim_amount,
                "days_since_policy_start": claim.days_since_policy_start,
                "prior_claims_count": claim.prior_claims_count,
                "incident_type": claim.incident_type,
            }
        ]
    )
    return engineer_features(raw)
