from app.agents.state import FraudInvestigationState
from app.ml.features import row_to_feature_vector


def run(state: FraudInvestigationState) -> dict:
    claim = state["claim"]
    errors = list(state.get("errors", []))

    if claim.claim_amount <= 0:
        errors.append(f"claim_amount must be positive, got {claim.claim_amount}")

    features_df = row_to_feature_vector(claim)
    return {"features": features_df.to_dict(orient="records")[0], "errors": errors}
