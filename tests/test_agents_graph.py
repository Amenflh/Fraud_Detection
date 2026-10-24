from app.agents import investigator_agent, risk_analyst_agent
from app.agents.graph import build_graph
from app.ml.features import engineer_features
from app.ml.model import FraudModel


def _trained_model(synthetic_claims_df):
    X = engineer_features(synthetic_claims_df)
    y = synthetic_claims_df["is_fraud"]
    model = FraudModel()
    model.fit(X, y)
    return model


def test_graph_produces_verdict_for_low_and_high_risk_claims(
    monkeypatch, synthetic_claims_df, fake_llm_client, low_risk_claim, high_risk_claim
):
    model = _trained_model(synthetic_claims_df)
    monkeypatch.setattr(risk_analyst_agent, "_load_model", lambda: model)

    graph = build_graph(llm_client=fake_llm_client)

    low_result = graph.invoke({"claim": low_risk_claim, "errors": []})
    high_result = graph.invoke({"claim": high_risk_claim, "errors": []})

    assert low_result["verdict"].claim_id == low_risk_claim.claim_id
    assert high_result["verdict"].claim_id == high_risk_claim.claim_id
    assert low_result["verdict"].final_verdict in {"fraud", "not_fraud", "needs_human_review"}


def test_conditional_edge_skips_investigation_for_low_risk_only(
    monkeypatch, synthetic_claims_df, fake_llm_client, low_risk_claim, high_risk_claim
):
    model = _trained_model(synthetic_claims_df)
    monkeypatch.setattr(risk_analyst_agent, "_load_model", lambda: model)

    investigated_claim_ids = []
    original_run = investigator_agent.run

    def spy_run(state, llm_client=None):
        investigated_claim_ids.append(state["claim"].claim_id)
        return original_run(state, llm_client=llm_client)

    monkeypatch.setattr(investigator_agent, "run", spy_run)

    graph = build_graph(llm_client=fake_llm_client)
    graph.invoke({"claim": low_risk_claim, "errors": []})
    graph.invoke({"claim": high_risk_claim, "errors": []})

    assert low_risk_claim.claim_id not in investigated_claim_ids
    assert high_risk_claim.claim_id in investigated_claim_ids
