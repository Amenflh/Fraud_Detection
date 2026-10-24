from typing import TypedDict

from app.schemas import ClaimInput, FraudVerdict, InvestigationNote, RiskAssessment


class FraudInvestigationState(TypedDict):
    claim: ClaimInput
    features: dict | None
    risk_assessment: RiskAssessment | None
    investigation: InvestigationNote | None
    verdict: FraudVerdict | None
    errors: list[str]
