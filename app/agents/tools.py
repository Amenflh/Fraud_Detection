from app.data.repository import NoDatasetError, get_repository


def lookup_prior_claims(policy_id: str) -> list[dict]:
    try:
        return get_repository().by_policy(policy_id)
    except NoDatasetError:
        return []


def policy_summary(policy_id: str) -> dict:
    claims = lookup_prior_claims(policy_id)
    if not claims:
        return {"policy_id": policy_id, "known_claims_count": 0}
    return {
        "policy_id": policy_id,
        "known_claims_count": len(claims),
        "total_claim_amount": sum(c.get("claim_amount", 0) for c in claims),
    }
