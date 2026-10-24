from openai import OpenAIError

from app.agents.state import FraudInvestigationState
from app.agents.tools import lookup_prior_claims, policy_summary
from app.llm.client import LLMClient, LLMNotConfiguredError
from app.schemas import InvestigationNote

SYSTEM_PROMPT = (
    "You are a fraud investigator for an insurance company. Given a claim, its risk "
    "assessment, and the policyholder's claim history, write a concise investigation "
    "note: a summary, a list of concrete red flags (empty if none), and note which "
    "tools you consulted."
)


def _rule_based_fallback(state: FraudInvestigationState, tool_calls: list[str]) -> InvestigationNote:
    claim = state["claim"]
    risk = state["risk_assessment"]
    red_flags = []
    if claim.days_since_policy_start < 30:
        red_flags.append("Claim filed shortly after policy start")
    if claim.prior_claims_count >= 2:
        red_flags.append("Multiple prior claims on this policy")
    if risk and risk.is_anomaly:
        red_flags.append("Flagged as statistical anomaly by risk model")

    return InvestigationNote(
        summary="LLM unavailable: rule-based fallback used. "
        f"Risk score {risk.risk_score if risk else 'n/a'} evaluated against threshold heuristics.",
        red_flags=red_flags,
        tool_calls_made=tool_calls,
    )


def run(state: FraudInvestigationState, llm_client: LLMClient | None = None) -> dict:
    errors = list(state.get("errors", []))
    claim = state["claim"]

    prior_claims = lookup_prior_claims(claim.policy_id)
    summary = policy_summary(claim.policy_id)
    tool_calls = ["lookup_prior_claims", "policy_summary"]

    if llm_client is None:
        from app.llm.client import get_llm_client

        llm_client = get_llm_client()

    try:
        structured_llm = llm_client.client.with_structured_output(InvestigationNote)
        user_prompt = (
            f"Claim: {claim.model_dump()}\n"
            f"Risk assessment: {state['risk_assessment'].model_dump() if state['risk_assessment'] else None}\n"
            f"Policy summary: {summary}\n"
            f"Prior claims: {prior_claims}"
        )
        note = structured_llm.invoke(
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}]
        )
        note.tool_calls_made = tool_calls
    except (LLMNotConfiguredError, OpenAIError) as exc:
        # Missing key, exhausted quota, network error...: degrade to rules instead of failing.
        if isinstance(exc, OpenAIError):
            llm_client.mark_unavailable()
        errors.append(str(exc))
        note = _rule_based_fallback(state, tool_calls)

    return {"investigation": note, "errors": errors}
