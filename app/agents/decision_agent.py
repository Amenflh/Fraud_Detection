from openai import OpenAIError

from app.agents.state import FraudInvestigationState
from app.llm.client import LLMClient, LLMNotConfiguredError
from app.schemas import FraudVerdict, InvestigationNote

SYSTEM_PROMPT = (
    "You are the final decision-maker for an insurance fraud triage system. Given a claim, "
    "its risk assessment, and an investigation note, decide the final verdict "
    "(fraud, not_fraud, or needs_human_review), a confidence (0-1), and write a short "
    "human-readable report in French explaining the reasoning."
)


def _investigation_or_default(state: FraudInvestigationState) -> InvestigationNote:
    return state.get("investigation") or InvestigationNote(
        summary="Fast-tracked: risk score below investigation threshold, no deep investigation performed.",
        red_flags=[],
        tool_calls_made=[],
    )


def _deterministic_verdict(state: FraudInvestigationState) -> FraudVerdict:
    claim = state["claim"]
    risk = state["risk_assessment"]
    investigation = _investigation_or_default(state)

    if risk.risk_score >= 0.85:
        verdict, confidence = "fraud", risk.risk_score
    elif risk.risk_score >= 0.5:
        verdict, confidence = "needs_human_review", risk.risk_score
    else:
        verdict, confidence = "not_fraud", 1 - risk.risk_score

    report = (
        f"Sinistre {claim.claim_id} (police {claim.policy_id}) : score de risque "
        f"{risk.risk_score:.2f} (modele: {risk.model_used}). "
        f"Signaux releves: {', '.join(investigation.red_flags) or 'aucun'}. "
        f"Verdict base sur des regles (LLM indisponible)."
    )

    return FraudVerdict(
        claim_id=claim.claim_id,
        final_verdict=verdict,
        confidence=round(confidence, 4),
        report=report,
        risk_assessment=risk,
        investigation=investigation,
    )


def run(state: FraudInvestigationState, llm_client: LLMClient | None = None) -> dict:
    errors = list(state.get("errors", []))
    claim = state["claim"]
    investigation = _investigation_or_default(state)

    if llm_client is None:
        from app.llm.client import get_llm_client

        llm_client = get_llm_client()

    try:
        structured_llm = llm_client.client.with_structured_output(FraudVerdict)
        user_prompt = (
            f"Claim: {claim.model_dump()}\n"
            f"Risk assessment: {state['risk_assessment'].model_dump()}\n"
            f"Investigation: {investigation.model_dump()}"
        )
        verdict = structured_llm.invoke(
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}]
        )
        verdict.claim_id = claim.claim_id
        verdict.risk_assessment = state["risk_assessment"]
        verdict.investigation = investigation
    except (LLMNotConfiguredError, OpenAIError) as exc:
        # Missing key, exhausted quota, network error...: degrade to rules instead of failing.
        if isinstance(exc, OpenAIError):
            llm_client.mark_unavailable()
        errors.append(str(exc))
        verdict = _deterministic_verdict(state)

    return {"verdict": verdict, "errors": errors}
