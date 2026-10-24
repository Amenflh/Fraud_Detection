import base64
import io
from datetime import date

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.agents import damage_agent, dossier_graph
from app.agents.circumstance_agent import _rules as extract_rules
from app.agents.responsibility_agent import decide
from app.constat import service as constat_service
from app.db.engine import get_db
from app.db.models import Actor, Contract
from app.dossiers import service
from app.fraud_rules import consortium
from app.fraud_rules.rules import RULES
from app.main import app
from tests.test_dossiers import _FakeFraudGraph, _NoLLM, _payload


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(dossier_graph, "fraud_graph", lambda: _FakeFraudGraph())
    monkeypatch.setattr("app.llm.client.get_llm_client", lambda: _NoLLM())
    monkeypatch.setattr(service, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(constat_service, "UPLOAD_DIR", tmp_path / "constats")

    db = next(app.dependency_overrides[get_db]())
    db.add_all(
        [
            Actor(id="EXP-A", role="expert", name="Expert Tunis", city="Tunis", specialties=["collision"], rating=4.5),
            Actor(id="GAR-A", role="garage", name="Garage A", city="Tunis", specialties=[], rating=4.0),
            Contract(
                policy_id="POL-1", plate="200 TU 1234", holder_name="Amira Ben Ali", phone="+216 20 111 222",
                make_model="Peugeot 208", year=2019, city="Tunis", start_date=date(2024, 1, 1), end_date=date(2030, 1, 1), insurer="Votre compagnie",
            ),
        ]
    )
    db.commit()
    return TestClient(app)


def _signature() -> dict:
    buf = io.BytesIO()
    Image.new("RGBA", (40, 20), (0, 0, 0, 255)).save(buf, "PNG")
    return {"image": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(), "lat": 36.8, "lng": 10.18}


@pytest.mark.parametrize(
    "text,cases_a,cases_b",
    [
        ("J'étais arrêté au feu rouge quand le véhicule derrière moi m'a percuté à l'arrière.", [1], [8]),
        ("Je sortais d'un parking et une voiture m'a heurté.", [4], []),
        ("Le camion a changé de file brusquement, j'étais sur la file de droite.", [9], [10]),
        ("J'ai grillé le feu rouge et j'ai heurté une voiture qui venait de ma droite.", [17], [16]),
    ],
)
def test_circumstance_agent_maps_account_to_boxes(text, cases_a, cases_b):
    r = extract_rules(text)
    assert r.cases_a == cases_a
    assert r.cases_b_hint == cases_b


def test_responsibility_scale():
    assert decide([1], [8])["b"] == 100
    assert decide([8], [])["a"] == 100
    assert decide([], [17])["b"] == 100
    assert decide([16], [])["b"] == 100  # A came from the right: B had to yield
    split = decide([16], [16])
    assert split["a"] == 50 and split["contradiction"]


def test_damage_agent_compares_with_subscription(tmp_path):
    def car(color, damage=False):
        img = Image.new("RGB", (320, 240), (120, 120, 120))
        d = ImageDraw.Draw(img)
        d.rectangle([60, 110, 260, 180], fill=color)
        if damage:
            d.ellipse([110, 120, 220, 175], fill=(20, 20, 20))
        buf = io.BytesIO()
        img.save(buf, "JPEG")
        return buf.getvalue()

    ref = tmp_path / "ref.jpg"
    ref.write_bytes(car((200, 30, 30)))
    assert damage_agent.compare(car((200, 30, 30)), str(ref), tmp_path / "h1.jpg")["verdict"] == "aucun_choc"
    hit = damage_agent.compare(car((200, 30, 30), damage=True), str(ref), tmp_path / "h2.jpg")
    assert hit["verdict"] == "choc_detecte" and hit["zones"] and (tmp_path / "h2.jpg").exists()
    assert damage_agent.compare(car((240, 240, 240)), str(ref), tmp_path / "h3.jpg")["verdict"] == "vehicule_different"


def test_constat_two_drivers_seal_and_convert(client):
    found = client.get("/contracts/lookup", params={"policy_id": "POL-1", "plate": "200 tu 1234"})
    assert found.status_code == 200 and found.json()["holder_name"] == "Amira Ben Ali"
    assert client.get("/contracts/lookup", params={"policy_id": "POL-1", "plate": "999 TU 1"}).status_code == 404

    created = client.post(
        "/constats",
        json={
            "accident_at": "2026-10-20T18:00:00",
            "lat": 36.8, "lng": 10.18, "city": "Tunis",
            "party_a": {"name": "Amira Ben Ali", "phone": "+216 20 111 222", "plate": "200 TU 1234", "make_model": "Peugeot 208", "policy_id": "POL-1"},
            "transcript_a": "J'étais arrêté au feu quand la voiture derrière m'a percuté à l'arrière.",
        },
    ).json()
    assert created["party_a"]["cases"] == [1]  # filled from the voice transcript
    token = created["token"]

    public = client.get(f"/public/constats/{token}").json()
    assert "phone" not in str(public["vehicle_a"])  # B never sees A's contact details

    party_b = {"name": "Nizar G", "phone": "+216 22 000 000", "plate": "201 TU 7788", "make_model": "Symbol", "cases": [8], "damage": ["avant"]}
    assert client.post(f"/public/constats/{token}/party-b", json={"party_b": party_b, "signature": _signature()}).status_code == 200
    signed = client.post(f"/constats/{created['id']}/sign", json=_signature()).json()
    assert signed["status"] == "signe" and len(signed["seal"]) == 64
    assert signed["analysis"]["responsibility"]["b"] == 100

    dossier_id = client.post(f"/constats/{created['id']}/convert", json={"claim_amount": 2500, "garage_id": "GAR-A"}).json()["dossier_id"]
    dossier = client.get(f"/dossiers/{dossier_id}").json()
    assert dossier["ai"]["constat"]["third_parties"][0]["phone"] == "+216 22 000 000"
    assert "rules" in dossier["ai"]


def test_complacent_constat_is_flagged(client):
    c = client.post(
        "/constats",
        json={
            "accident_at": "2026-10-20T23:30:00", "city": "Tunis",
            "party_a": {"name": "Hedi Mansour", "phone": "+216 97 222 111", "plate": "200 TU 1234", "make_model": "Leon", "address": "12 rue X"},
        },
    ).json()
    b = {"name": "Rim Mansour", "phone": "+216 97 222 111", "plate": "222 TU 1", "make_model": "Punto", "address": "12 rue X"}
    client.post(f"/public/constats/{c['token']}/party-b", json={"party_b": b, "signature": _signature()})
    signed = client.post(f"/constats/{c['id']}/sign", json=_signature()).json()
    codes = {f["code"] for f in signed["analysis"]["coherence"]}
    assert {"K03", "K05"} <= codes


def test_rules_catalog_config_backtest_and_consortium(client):
    dossier_id = client.post("/dossiers", json=_payload(days_since_policy_start=10)).json()["id"]
    assert any(h["id"] == "C01" for h in client.get(f"/dossiers/{dossier_id}").json()["ai"]["rules"]["hits"])

    catalog = client.get("/rules").json()
    assert catalog["total"] == len(RULES) >= 45

    bt = client.post("/rules/backtest", json={"overrides": {"C01": {"enabled": False}}}).json()
    assert bt["before"]["per_rule"]["C01"] == 1 and bt["after"]["per_rule"]["C01"] == 0

    assert client.patch("/rules/C01", json={"enabled": False}).json()["rule"]["enabled"] is False
    assert not any(h["id"] == "C01" for h in client.get(f"/dossiers/{dossier_id}").json()["ai"]["rules"]["hits"])

    # Another company reports this phone: the federation rule fires, without the phone in clear.
    db = next(app.dependency_overrides[get_db]())
    db.add(consortium.ConsortiumEntry(kind="phone", identifier_hash=consortium.hash_identifier("phone", "+216 20 111 222"), company="Autre", reason="Test"))
    db.commit()
    second = client.post("/dossiers", json=_payload()).json()
    assert any(h["id"] == "R07" for h in second["ai"]["rules"]["hits"])
    assert "+216" not in str(client.get("/consortium").json())


def test_saas_fraud_check_requires_api_key(client):
    body = {**_payload(), "reference": "EXT-1"}
    assert client.post("/api/v1/fraud/check", json=body).status_code == 401
    res = client.post("/api/v1/fraud/check", json=body, headers={"X-API-Key": "demo-saas-key"})
    assert res.status_code == 200
    assert {"fraud_index", "level", "rules", "consortium_hits", "recommendation"} <= res.json().keys()
    assert client.get("/dossiers").json()["total"] == 0  # nothing persisted
