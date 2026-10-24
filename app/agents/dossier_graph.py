"""Intake orchestration for a new claim file (LangGraph):

    fraud_triage (4-agent fraud pipeline) -> network_check -> expert_dispatch

The fraud pipeline is reused as a sub-graph; the other agents enrich the file so the
claims handler gets a ready-to-act dossier. The Copilot runs afterwards, on every change.
"""
from functools import lru_cache, partial
from typing import TypedDict

from langgraph.graph import END, StateGraph
from sqlalchemy.orm import Session

from app.agents import dispatch_agent, network_agent
from app.agents.graph import build_graph
from app.db.models import Dossier
from app.schemas import ClaimInput, FraudVerdict


class DossierState(TypedDict):
    claim: ClaimInput
    verdict: FraudVerdict | None
    network: dict | None
    dispatch: list | None
    errors: list[str]


@lru_cache
def fraud_graph():
    return build_graph()


def _fraud_triage(state: DossierState) -> dict:
    result = fraud_graph().invoke({"claim": state["claim"], "errors": []})
    return {"verdict": result["verdict"], "errors": state["errors"] + result.get("errors", [])}


def _network_check(state: DossierState, db: Session, dossier: Dossier) -> dict:
    dossier.verdict_json = state["verdict"].model_dump(mode="json")
    return {"network": network_agent.analyze(db, dossier)}


def _expert_dispatch(state: DossierState, db: Session, dossier: Dossier) -> dict:
    return {"dispatch": dispatch_agent.rank_experts(db, dossier, state["verdict"].final_verdict)}


def run_intake(db: Session, dossier: Dossier, claim: ClaimInput) -> DossierState:
    graph = StateGraph(DossierState)
    graph.add_node("fraud_triage", _fraud_triage)
    graph.add_node("network_check", partial(_network_check, db=db, dossier=dossier))
    graph.add_node("expert_dispatch", partial(_expert_dispatch, db=db, dossier=dossier))
    graph.set_entry_point("fraud_triage")
    graph.add_edge("fraud_triage", "network_check")
    graph.add_edge("network_check", "expert_dispatch")
    graph.add_edge("expert_dispatch", END)

    return graph.compile().invoke(
        {"claim": claim, "verdict": None, "network": None, "dispatch": None, "errors": []}
    )
