from datetime import date
from typing import Literal

from pydantic import BaseModel


class ClaimInput(BaseModel):
    claim_id: str
    policy_id: str
    claim_amount: float
    claim_date: date
    incident_type: str
    days_since_policy_start: int
    prior_claims_count: int
    vehicle_age: int | None = None
    claim_description: str | None = None


class RiskAssessment(BaseModel):
    model_config = {"protected_namespaces": ()}

    risk_score: float
    is_anomaly: bool
    model_used: Literal["isolation_forest", "xgboost", "ensemble", "none"]
    feature_contributions: dict[str, float] | None = None


class InvestigationNote(BaseModel):
    summary: str
    red_flags: list[str] = []
    tool_calls_made: list[str] = []


class FraudVerdict(BaseModel):
    claim_id: str
    final_verdict: Literal["fraud", "not_fraud", "needs_human_review"]
    confidence: float
    report: str
    risk_assessment: RiskAssessment
    investigation: InvestigationNote


class AnalyzeClaimRequest(BaseModel):
    claim: ClaimInput


class AnalyzeClaimResponse(BaseModel):
    verdict: FraudVerdict


class ScoreBucket(BaseModel):
    range_label: str
    count: int


class ClaimsStats(BaseModel):
    total_claims: int
    fraud_count: int
    not_fraud_count: int
    needs_review_count: int
    fraud_rate: float
    avg_risk_score: float
    score_distribution: list[ScoreBucket]


class StatsResponse(BaseModel):
    stats: ClaimsStats


class ClaimsListResponse(BaseModel):
    claims: list[FraudVerdict]
    total: int
