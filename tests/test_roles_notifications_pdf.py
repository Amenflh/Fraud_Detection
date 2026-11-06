import base64
import io
import re
import smtplib
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.agents import dossier_graph
from app.auth import get_current_user
from app.config import get_settings
from app.constat import service as constat_service
from app.db.engine import get_db
from app.db.models import Actor, Constat, Contract, Dossier, Notification
from app.dossiers import service
from app.main import app
from app.notifications import providers
from app.notifications import service as notify
from tests.test_dossiers import _FakeFraudGraph, _NoLLM, _payload


@pytest.fixture(autouse=True)
def fresh_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def db():
    return next(app.dependency_overrides[get_db]())


@pytest.fixture
def client(monkeypatch, tmp_path, db):
    monkeypatch.setattr(dossier_graph, "fraud_graph", lambda: _FakeFraudGraph())
    monkeypatch.setattr("app.llm.client.get_llm_client", lambda: _NoLLM())
    monkeypatch.setattr(service, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(constat_service, "UPLOAD_DIR", tmp_path / "constats")
    db.add_all(
        [
            Actor(id="EXP-A", role="expert", name="Expert Tunis", city="Tunis", specialties=["collision"], rating=4.5, email="exp.a@x.tn", phone="+216 71 000 001"),
            Actor(id="EXP-B", role="expert", name="Expert Sfax", city="Sfax", specialties=["fire"], rating=4.0),
            Actor(id="GAR-A", role="garage", name="Garage A", city="Tunis", specialties=[], rating=4.0),
            Actor(id="GAR-B", role="garage", name="Garage B", city="Sfax", specialties=[], rating=4.0),
            Contract(policy_id="POL-1", plate="200 TU 1234", holder_name="Amira Ben Ali", phone="+216 20 111 222", email="amira@exemple.tn",
                     make_model="Peugeot 208", year=2019, city="Tunis", start_date=date(2024, 1, 1), end_date=date(2030, 1, 1), insurer="Votre compagnie"),
        ]
    )
    db.commit()
    return TestClient(app)


def as_user(role: str, email: str = "user@x.tn", actor_id: str | None = None):
    claims = {"sub": f"id-{role}", "email": email, "app_metadata": {"role": role, **({"actor_id": actor_id} if actor_id else {})}}
    app.dependency_overrides[get_current_user] = lambda: claims


def manager_creates(client, email="amira@exemple.tn", **overrides) -> dict:
    as_user("gestionnaire", "boss@x.tn")
    insured = {"name": "Amira Ben Ali", "phone": "+216 20 111 222", "email": email}
    return client.post("/dossiers", json=_payload(insured=insured, **overrides)).json()


# --- roles & visibility ---------------------------------------------------------------------


def test_insured_sees_only_own_file_without_any_fraud_information(client):
    mine = manager_creates(client, days_since_policy_start=10, claim_amount=20000)  # triggers several rules
    other = manager_creates(client, email="someone.else@x.tn")
    assert mine["ai"]["rules"]["hits"], "precondition: the manager sees fraud signals"

    as_user("assure", "amira@exemple.tn")
    listing = client.get("/dossiers").json()
    assert [d["id"] for d in listing["dossiers"]] == [mine["id"]]
    assert client.get(f"/dossiers/{other['id']}").status_code == 404  # not even revealed to exist

    detail = client.get(f"/dossiers/{mine['id']}").json()
    assert detail["fraud"] is None and detail["risk_score"] is None and detail["verdict"] is None
    assert detail["fraud_index"] is None and detail["alerts"] == 0 and detail["network_level"] == "none"
    assert set(detail["ai"]) == {"channel"}
    assert all(e["kind"] not in ("alert", "agent") and e["role"] != "ia" or e["kind"] == "status_change" for e in detail["events"])
    assert "fraud" not in str(detail["events"]).lower() and "score" not in str(detail["events"]).lower()
    assert detail["allowed_next"] == []


def test_garage_and_expert_are_scoped_to_their_files(client):
    d = manager_creates(client, garage_id="GAR-A")
    as_user("gestionnaire")
    client.post(f"/dossiers/{d['id']}/assign-expert", json={"expert_id": "EXP-A"})

    as_user("expert", actor_id="EXP-A")
    assert [x["id"] for x in client.get("/dossiers").json()["dossiers"]] == [d["id"]]
    assert client.get(f"/dossiers/{d['id']}").json()["ai"]["rules"] is not None  # experts investigate: full view
    as_user("expert", actor_id="EXP-B")
    assert client.get(f"/dossiers/{d['id']}").status_code == 404

    as_user("garage", actor_id="GAR-A")
    detail = client.get(f"/dossiers/{d['id']}").json()
    assert detail["ai"] == {"channel": "mobile"} and detail["fraud"] is None  # a garage may be part of a ring
    as_user("garage", actor_id="GAR-B")
    assert client.get(f"/dossiers/{d['id']}").status_code == 404


def test_transition_and_upload_permissions(client):
    d = manager_creates(client, garage_id="GAR-A")
    as_user("gestionnaire")
    client.post(f"/dossiers/{d['id']}/assign-expert", json={"expert_id": "EXP-A"})

    as_user("garage", actor_id="GAR-A")
    quote = client.post(f"/dossiers/{d['id']}/documents", files={"file": ("q.pdf", b"%PDF", "application/pdf")}, data={"kind": "devis", "amount": "9000"})
    assert quote.status_code == 201 and quote.json()["analysis"] == {}  # garage must not learn the quote verdict
    report = client.post(f"/dossiers/{d['id']}/documents", files={"file": ("r.pdf", b"%PDF", "application/pdf")}, data={"kind": "rapport_expertise"})
    assert report.status_code == 403
    assert client.post(f"/dossiers/{d['id']}/advance", json={"status": "en_reparation"}).status_code == 403

    as_user("expert", actor_id="EXP-A")
    assert client.post(f"/dossiers/{d['id']}/advance", json={"status": "rejete"}).status_code == 403  # only a manager rejects
    ok = client.post(f"/dossiers/{d['id']}/advance", json={"status": "en_reparation"})
    assert ok.status_code == 200 and ok.json()["status"] == "en_reparation"


def test_client_cannot_spoof_role_on_messages_or_assign_experts(client):
    d = manager_creates(client)
    as_user("gestionnaire")
    client.post(f"/dossiers/{d['id']}/assign-expert", json={"expert_id": "EXP-A"})
    as_user("expert", actor_id="EXP-A")
    msg = client.post(f"/dossiers/{d['id']}/messages", json={"role": "gestionnaire", "text": "approuvé"}).json()
    assert msg["role"] == "expert"
    assert client.post(f"/dossiers/{d['id']}/assign-expert", json={"expert_id": "EXP-B"}).status_code == 403


def test_back_office_endpoints_are_closed_to_other_roles(client):
    for role, actor in (("assure", None), ("expert", "EXP-A"), ("garage", "GAR-A")):
        as_user(role, actor_id=actor)
        for path in ("/network", "/kpis/workflow", "/rules", "/consortium", "/stats", "/claims", "/notifications/status"):
            assert client.get(path).status_code == 403, (role, path)


def test_insured_declaration_is_bound_to_their_own_email(client):
    as_user("assure", "amira@exemple.tn")
    created = client.post("/dossiers", json=_payload(insured={"name": "Amira", "phone": "+216 20 111 222", "email": "attacker-chosen@x.tn"})).json()
    assert created["insured"]["email"] == "amira@exemple.tn"
    assert [d["id"] for d in client.get("/dossiers").json()["dossiers"]] == [created["id"]]


def test_insured_can_only_identify_their_own_vehicle(client):
    as_user("assure", "amira@exemple.tn")
    assert client.get("/contracts/lookup", params={"policy_id": "POL-1", "plate": "200 TU 1234"}).status_code == 200
    as_user("assure", "intruder@x.tn")
    assert client.get("/contracts/lookup", params={"policy_id": "POL-1", "plate": "200 TU 1234"}).status_code == 404


# --- notifications --------------------------------------------------------------------------


def test_status_changes_notify_the_insured_without_mentioning_fraud(client, db):
    d = manager_creates(client)
    as_user("gestionnaire")
    client.post(f"/dossiers/{d['id']}/advance", json={"status": "expert_missionne"})
    client.post(f"/dossiers/{d['id']}/advance", json={"status": "rejete", "note": "réseau de fraude"})

    rows = client.get(f"/dossiers/{d['id']}/notifications").json()
    assert {r["status"] for r in rows} == {"simulated"}  # no provider configured -> recorded, not sent
    insured_rows = [r for r in rows if r["recipient_role"] == "assure"]
    assert {r["channel"] for r in insured_rows} == {"sms", "email"}
    assert not any("fraud" in (r["body"] + (r["subject"] or "")).lower() for r in insured_rows)
    assert all(len(r["body"]) <= 160 for r in insured_rows if r["channel"] == "sms")
    mission = [r for r in rows if r["kind"] == "mission"]
    assert {r["recipient"] for r in mission} == {"exp.a@x.tn", "+216 71 000 001"}


def test_fraud_alert_email_goes_to_managers_once(client, monkeypatch):
    monkeypatch.setenv("ALERT_EMAILS", "boss@x.tn, risk@x.tn")
    monkeypatch.setenv("FRAUD_ALERT_THRESHOLD", "15")
    get_settings.cache_clear()
    d = manager_creates(client, days_since_policy_start=5)  # rule C01 (15) reaches the threshold
    as_user("gestionnaire")
    for _ in range(2):  # more activity re-evaluates the rules: must not re-alert
        client.post(f"/dossiers/{d['id']}/messages", json={"role": "gestionnaire", "text": "suivi"})
        client.post(f"/dossiers/{d['id']}/documents", files={"file": ("x.pdf", b"%PDF", "application/pdf")}, data={"kind": "autre"})
    alerts = [n for n in client.get(f"/dossiers/{d['id']}/notifications").json() if n["kind"] == "fraud-alert"]
    assert sorted(a["recipient"] for a in alerts) == ["boss@x.tn", "risk@x.tn"]
    assert "ALERTE FRAUDE" in alerts[0]["subject"] and "C01" in alerts[0]["body"]


def test_manual_notification_requires_manager_and_a_recipient(client):
    d = manager_creates(client)
    as_user("gestionnaire")
    sent = client.post(f"/dossiers/{d['id']}/notify", json={"message": "Merci d'apporter votre carte grise.", "channels": ["sms"]})
    assert sent.status_code == 202 and sent.json()[0]["channel"] == "sms"
    as_user("agent")
    assert client.post(f"/dossiers/{d['id']}/notify", json={"message": "test message", "channels": ["sms"]}).status_code == 403


def test_allowlist_blocks_unlisted_recipients(client, monkeypatch):
    monkeypatch.setenv("NOTIFY_ALLOWLIST", "someone-else@x.tn")
    get_settings.cache_clear()
    d = manager_creates(client)
    rows = client.get(f"/dossiers/{d['id']}/notifications").json()
    assert rows and {r["status"] for r in rows} == {"skipped"}


def test_smtp_provider_builds_multipart_message(monkeypatch):
    calls = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            calls["connect"] = (host, port)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            calls["tls"] = True

        def login(self, user, password):
            calls["login"] = (user, password)

        def send_message(self, msg, from_addr=None):
            calls["msg"], calls["from"] = msg, from_addr

    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_USER", "apikey")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_FROM", "Sentinelle <no-reply@sentinelle.example>")
    assert providers.send_email(get_settings(), "client@x.tn", "Sujet", "texte", "<p>html</p>") == "smtp"
    assert calls["connect"] == ("smtp.example.com", 587) and calls["tls"] and calls["login"] == ("apikey", "secret")
    assert calls["from"] == "no-reply@sentinelle.example" and calls["msg"]["To"] == "client@x.tn"
    assert calls["msg"].is_multipart()


def test_twilio_provider_sends_normalized_number_and_single_segment_text(monkeypatch):
    captured = {}

    def fake_post(url, data, auth, timeout):
        captured.update(url=url, data=data, auth=auth)
        return httpx.Response(201, json={"sid": "SM1"})

    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC123")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "tok")
    monkeypatch.setenv("TWILIO_FROM", "+15005550006")
    assert providers.send_sms(get_settings(), "22 418 903", "Dossier clôturé « ok » — merci") == "twilio"
    assert captured["url"].endswith("/Accounts/AC123/Messages.json") and captured["auth"] == ("AC123", "tok")
    assert captured["data"]["To"] == "+21622418903" and captured["data"]["From"] == "+15005550006"
    assert all(ord(ch) < 128 or ch in "éèùàì" for ch in captured["data"]["Body"])


def test_failed_deliveries_are_retried_then_marked_failed(client, monkeypatch, db):
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC123")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "tok")
    monkeypatch.setenv("TWILIO_FROM", "+15005550006")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(400, json={"message": "invalid number"}))
    get_settings.cache_clear()
    d = manager_creates(client)
    sms = db.execute(select(Notification).where(Notification.dossier_id == d["id"], Notification.channel == "sms")).scalars().first()
    assert sms.status == "pending" and sms.attempts == 1 and "invalid number" in sms.error
    from sqlalchemy.orm import sessionmaker

    factory = sessionmaker(bind=db.get_bind(), autoflush=False, autocommit=False)
    notify.dispatch_pending(factory)
    notify.dispatch_pending(factory)
    db.refresh(sms)
    assert sms.status == "failed" and sms.attempts == 3
    notify.dispatch_pending(factory)  # failed rows are not retried automatically
    db.refresh(sms)
    assert sms.attempts == 3


def test_phone_and_gsm_helpers():
    assert providers.normalize_phone("+216 22 418 903") == "+21622418903"
    assert providers.normalize_phone("00216 22 418 903") == "+21622418903"
    assert providers.normalize_phone("22418903") == "+21622418903"
    with pytest.raises(providers.DeliveryError):
        providers.normalize_phone("12")
    assert providers.gsm_safe("Réparation « terminée » ê") == 'Réparation " terminée " e'


# --- PDF & authenticity ---------------------------------------------------------------------


def _sig() -> dict:
    buf = io.BytesIO()
    Image.new("RGBA", (60, 30), (0, 0, 0, 255)).save(buf, "PNG")
    return {"image": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(), "lat": 36.8, "lng": 10.18}


def _signed_constat(client, owner="amira@exemple.tn") -> dict:
    as_user("assure", owner)
    c = client.post(
        "/constats",
        json={
            "accident_at": "2026-10-20T18:00:00", "lat": 36.8, "lng": 10.18, "city": "Tunis", "address": "Av. Bourguiba",
            "party_a": {"name": "Amira Ben Ali", "phone": "+216 20 111 222", "plate": "200 TU 1234", "make_model": "Peugeot 208", "policy_id": "POL-1"},
            "transcript_a": "J'étais arrêté au feu quand la voiture derrière moi m'a percuté à l'arrière.",
            "witnesses": [{"name": "Sami T", "phone": "+216 55 123 456"}],
        },
    ).json()
    photo = io.BytesIO()
    Image.new("RGB", (200, 150), (20, 120, 200)).save(photo, "JPEG")
    client.post(f"/constats/{c['id']}/files", files={"file": ("p.jpg", photo.getvalue(), "image/jpeg")}, data={"kind": "photo"})
    client.post(
        f"/public/constats/{c['token']}/party-b",
        json={"party_b": {"name": "Nizar G", "phone": "+216 22 000 000", "plate": "201 TU 7788", "make_model": "Symbol", "cases": [8], "damage": ["avant"]}, "signature": _sig()},
    )
    return client.post(f"/constats/{c['id']}/sign", json=_sig()).json()


def test_constat_pdf_is_a_two_page_document_with_access_control(client):
    signed = _signed_constat(client)
    res = client.get(f"/constats/{signed['id']}/pdf")
    assert res.status_code == 200 and res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF") and re.search(rb"/Count 2", res.content) and len(res.content) > 8000
    assert f"constat-{signed['id']}.pdf" in res.headers["content-disposition"]

    as_user("assure", "intruder@x.tn")
    assert client.get(f"/constats/{signed['id']}/pdf").status_code == 404
    as_user("gestionnaire")
    assert client.get(f"/constats/{signed['id']}/pdf").status_code == 200
    as_user("expert", actor_id="EXP-A")
    assert client.get(f"/constats/{signed['id']}/pdf").status_code == 403


def test_unsigned_constat_pdf_is_marked_as_draft(client):
    as_user("assure", "amira@exemple.tn")
    c = client.post(
        "/constats",
        json={"accident_at": "2026-10-20T18:00:00", "city": "Tunis",
              "party_a": {"name": "Amira", "phone": "+216 20 111 222", "plate": "200 TU 1234", "make_model": "Peugeot 208"}},
    ).json()
    assert client.get(f"/constats/{c['id']}/pdf").status_code == 200  # renders (with a watermark) rather than failing


def test_seal_verification_detects_tampering(client, db):
    signed = _signed_constat(client)
    public = TestClient(app)
    ok = public.get(f"/public/verify/{signed['id']}", params={"seal": signed["seal"]}).json()
    assert ok["valid"] is True and ok["content_unaltered"] and ok["signatures_unaltered"]
    assert "name" not in str(ok).lower()  # no personal data on the public endpoint

    assert public.get(f"/public/verify/{signed['id']}", params={"seal": "0" * 64}).json()["valid"] is False

    c = db.get(Constat, signed["id"])
    c.party_a = {**c.party_a, "name": "Someone Else"}  # someone edits the database after signing
    db.commit()
    tampered = public.get(f"/public/verify/{signed['id']}").json()
    assert tampered["valid"] is False and tampered["content_unaltered"] is False


# --- account provisioning script -----------------------------------------------------------


def test_manage_users_writes_role_in_app_metadata_not_user_metadata():
    from scripts import manage_users

    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"], seen["auth"], seen["body"] = str(request.url), request.headers["authorization"], request.read()
        return httpx.Response(200, json={"id": "u1"})

    admin = manage_users.AdminClient("https://proj.supabase.co", "SERVICE", httpx.Client(transport=httpx.MockTransport(handler)))
    admin.create("expert@x.tn", "pw", "expert", "EXP-01")
    assert seen["url"] == "https://proj.supabase.co/auth/v1/admin/users" and seen["auth"] == "Bearer SERVICE"
    assert b'"app_metadata"' in seen["body"] and b'"actor_id": "EXP-01"' in seen["body"] and b"user_metadata" not in seen["body"]
    with pytest.raises(SystemExit):
        manage_users.app_metadata("expert", None)  # partners must be linked to an actor row
    with pytest.raises(SystemExit):
        manage_users.app_metadata("superadmin", None)
