import io
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.agents import dossier_graph
from app.db.engine import get_db
from app.db.models import Actor
from app.dossiers import service
from app.llm.client import LLMNotConfiguredError
from app.main import app
from app.schemas import FraudVerdict, InvestigationNote, RiskAssessment


class _FakeFraudGraph:
    def __init__(self, verdict: str = "not_fraud", score: float = 0.2) -> None:
        self.verdict, self.score = verdict, score

    def invoke(self, state: dict) -> dict:
        return {
            "verdict": FraudVerdict(
                claim_id=state["claim"].claim_id,
                final_verdict=self.verdict,
                confidence=0.8,
                report="Fake report.",
                risk_assessment=RiskAssessment(risk_score=self.score, is_anomaly=False, model_used="none"),
                investigation=InvestigationNote(summary="Fake.", tool_calls_made=["lookup_prior_claims"]),
            ),
            "errors": [],
        }


class _NoLLM:
    @property
    def client(self):
        raise LLMNotConfiguredError("offline")


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(dossier_graph, "fraud_graph", lambda: _FakeFraudGraph())
    monkeypatch.setattr("app.llm.client.get_llm_client", lambda: _NoLLM())
    monkeypatch.setattr(service, "UPLOAD_DIR", tmp_path / "uploads")

    db = next(app.dependency_overrides[get_db]())
    db.add_all(
        [
            Actor(id="EXP-A", role="expert", name="Expert Tunis", city="Tunis", specialties=["collision"], rating=4.5),
            Actor(id="EXP-B", role="expert", name="Expert Sfax", city="Sfax", specialties=["fire"], rating=4.9),
            Actor(id="GAR-A", role="garage", name="Garage A", city="Tunis", specialties=[], rating=4.0),
        ]
    )
    db.commit()
    return TestClient(app)


def _payload(**overrides) -> dict:
    payload = {
        "policy_id": "POL-1",
        "claim_amount": 4000,
        "claim_date": "2026-10-10",
        "incident_type": "collision",
        "days_since_policy_start": 800,
        "prior_claims_count": 0,
        "insured": {"name": "Amira Ben Ali", "phone": "+216 20 111 222", "email": "amira@exemple.tn"},
        "vehicle": {"plate": "200 TU 1234", "make_model": "Peugeot 208"},
        "city": "Tunis",
        "garage_id": "GAR-A",
    }
    payload.update(overrides)
    return payload


def _jpeg(color: tuple[int, int, int], taken_at: datetime | None = None, pattern: int = 0) -> bytes:
    img = Image.new("RGB", (320, 240), color)
    for x in range(0, 320, 40 + pattern * 7):
        img.paste((255 - color[0], 80, 40 * pattern % 255), (x, 0, x + 15 + pattern, 240))
    exif = Image.Exif()
    if taken_at:
        exif[306] = taken_at.strftime("%Y:%m:%d %H:%M:%S")
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


def test_declaration_runs_intake_agents(client):
    res = client.post("/dossiers", json=_payload())
    assert res.status_code == 201
    d = res.json()
    assert d["status"] == "analyse_ia"
    assert d["fraud"]["final_verdict"] == "not_fraud"
    assert d["ai"]["dispatch"][0]["expert_id"] == "EXP-A"  # same city + specialty
    assert d["ai"]["copilot"]["source"] == "rules"
    assert [e["kind"] for e in d["events"]][:2] == ["status_change", "status_change"]


def test_workflow_transitions_and_validation(client):
    dossier_id = client.post("/dossiers", json=_payload()).json()["id"]

    bad = client.post(f"/dossiers/{dossier_id}/advance", json={"status": "cloture"})
    assert bad.status_code == 409

    res = client.post(f"/dossiers/{dossier_id}/advance", json={"status": "expert_missionne"})
    assert res.status_code == 200
    assert res.json()["expert"]["id"] == "EXP-A"  # auto-assigned from the dispatch ranking

    res = client.post(f"/dossiers/{dossier_id}/assign-expert", json={"expert_id": "GAR-A"})
    assert res.status_code == 409


def test_network_agent_links_shared_phone(client):
    client.post("/dossiers", json=_payload())
    second = client.post(
        "/dossiers",
        json=_payload(insured={"name": "Autre Nom", "phone": "+216 20 111 222"}, vehicle={"plate": "150 TU 9", "make_model": "Kia"}),
    ).json()
    assert second["network_level"] == "medium"
    assert second["ai"]["network"]["links"][0]["shared"] == ["téléphone", "garage"]


def test_photo_agent_detects_reuse_and_antedated_exif(client):
    first = client.post("/dossiers", json=_payload()).json()["id"]
    second = client.post("/dossiers", json=_payload(insured={"name": "X", "phone": "+216 50 000 000"})).json()["id"]
    photo = _jpeg((200, 30, 30), datetime(2026, 10, 10, 9, 0))

    ok = client.post(f"/dossiers/{first}/documents", files={"file": ("a.jpg", photo, "image/jpeg")}, data={"kind": "photo_avant", "role": "assure"})
    assert ok.status_code == 201
    assert ok.json()["analysis"]["verdict"] == "ok"

    reused = client.post(f"/dossiers/{second}/documents", files={"file": ("b.jpg", photo, "image/jpeg")}, data={"kind": "photo_avant", "role": "assure"})
    assert reused.json()["analysis"]["verdict"] == "suspect"
    assert reused.json()["analysis"]["duplicates"][0]["dossier_id"] == first

    old = _jpeg((30, 30, 200), datetime(2026, 9, 1, 9, 0), pattern=3)
    antedated = client.post(f"/dossiers/{first}/documents", files={"file": ("c.jpg", old, "image/jpeg")}, data={"kind": "photo_arriere"})
    assert any("avant la date" in f["text"] for f in antedated.json()["analysis"]["flags"])

    file_res = client.get(f"/documents/{ok.json()['id']}/file")
    assert file_res.status_code == 200
    assert file_res.content == photo


def test_quote_agent_flags_overbilling_and_moves_to_validation(client):
    dossier_id = client.post("/dossiers", json=_payload()).json()["id"]
    client.post(f"/dossiers/{dossier_id}/advance", json={"status": "expert_missionne"})

    res = client.post(
        f"/dossiers/{dossier_id}/documents",
        files={"file": ("devis.pdf", b"%PDF", "application/pdf")},
        data={"kind": "devis", "role": "garage", "amount": "7000"},
    )
    assert res.json()["analysis"]["quote"]["level"] == "high"  # 7000 vs 4000 declared
    detail = client.get(f"/dossiers/{dossier_id}").json()
    assert detail["status"] == "validation_devis"
    assert detail["ai"]["copilot"]["priority"] == "haute"


def test_chat_and_kpis(client):
    dossier_id = client.post("/dossiers", json=_payload()).json()["id"]
    msg = client.post(f"/dossiers/{dossier_id}/messages", json={"role": "assure", "text": "Bonjour"})
    assert msg.status_code == 201
    assert msg.json()["author"] == "Amira Ben Ali"

    kpis = client.get("/kpis/workflow").json()
    assert kpis["totals"]["dossiers"] == 1
    assert {s["key"] for s in kpis["stages"]} >= {"analyse_ia", "expert_missionne"}
    assert len(kpis["trend"]) == 30

    assert client.get("/network").status_code == 200
    assert client.get("/dossiers").json()["total"] == 1
