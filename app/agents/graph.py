from functools import partial

from langgraph.graph import END, StateGraph

from app.agents import decision_agent, investigator_agent, preprocessing_agent, risk_analyst_agent
from app.agents.state import FraudInvestigationState
from app.config import get_settings
from app.llm.client import LLMClient


def route_by_risk(state: FraudInvestigationState) -> str:
    risk = state["risk_assessment"]
    threshold = get_settings().fraud_score_threshold
    if risk is not None and risk.risk_score >= threshold * 0.6:
        return "investigate"
    return "decide"


def build_graph(llm_client: LLMClient | None = None):
    graph = StateGraph(FraudInvestigationState)

    graph.add_node("preprocess", preprocessing_agent.run)
    graph.add_node("risk_analysis", risk_analyst_agent.run)
    graph.add_node("investigate", partial(investigator_agent.run, llm_client=llm_client))
    graph.add_node("decide", partial(decision_agent.run, llm_client=llm_client))

    graph.set_entry_point("preprocess")
    graph.add_edge("preprocess", "risk_analysis")
    graph.add_conditional_edges(
        "risk_analysis", route_by_risk, {"investigate": "investigate", "decide": "decide"}
    )
    graph.add_edge("investigate", "decide")
    graph.add_edge("decide", END)

    return graph.compile()
