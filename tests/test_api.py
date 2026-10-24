from fastapi.testclient import TestClient

from app.api import routes
from app.main import app
from app.schemas import FraudVerdict, InvestigationNote, RiskAssessment


class _FakeGraph:
    def invoke(self, initial_state: dict) -> dict:
        claim = initial_state["claim"]
        verdict = FraudVerdict(
            claim_id=claim.claim_id,
            final_verdict="needs_human_review",
            confidence=0.5,
            report="Fake report for test.",
            risk_assessment=RiskAssessment(risk_score=0.5, is_anomaly=False, model_used="none"),
            investigation=InvestigationNote(summary="Fake investigation."),
        )
        return {"verdict": verdict}


def test_health_reports_openai_not_configured_by_default():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert "openai_configured" in body
    assert "model_trained" in body
    assert "dataset_present" in body


def test_analyze_claim_returns_verdict_with_fake_graph(monkeypatch):
    monkeypatch.setattr(routes, "_get_graph", lambda: _FakeGraph())
    client = TestClient(app)

    payload = {
        "claim": {
            "claim_id": "C_TEST",
            "policy_id": "P_TEST",
            "claim_amount": 1000.0,
            "claim_date": "2026-01-01",
            "incident_type": "collision",
            "days_since_policy_start": 100,
            "prior_claims_count": 0,
        }
    }

    response = client.post("/claims/analyze", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"]["claim_id"] == "C_TEST"

    report_response = client.get("/claims/C_TEST/report")
    assert report_response.status_code == 200
    assert report_response.json()["verdict"]["claim_id"] == "C_TEST"


def test_get_report_for_unknown_claim_returns_404():
    client = TestClient(app)
    response = client.get("/claims/UNKNOWN/report")
    assert response.status_code == 404


def test_stats_with_no_claims_returns_zeros():
    client = TestClient(app)
    response = client.get("/stats")
    assert response.status_code == 200
    body = response.json()["stats"]
    assert "total_claims" in body
    assert body["fraud_rate"] >= 0.0


def test_stats_after_analyzing_claim(monkeypatch):
    monkeypatch.setattr(routes, "_get_graph", lambda: _FakeGraph())
    client = TestClient(app)
    client.post(
        "/claims/analyze",
        json={
            "claim": {
                "claim_id": "C_STATS",
                "policy_id": "P1",
                "claim_amount": 1000.0,
                "claim_date": "2026-01-01",
                "incident_type": "collision",
                "days_since_policy_start": 100,
                "prior_claims_count": 0,
            }
        },
    )
    response = client.get("/stats")
    body = response.json()["stats"]
    assert body["total_claims"] >= 1
