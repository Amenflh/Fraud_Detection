"""Claim-file use cases: declaration, workflow transitions, expert assignment, chat and
documents. Every state change re-runs the Copilot so its recommendation stays current."""
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents import copilot_agent, damage_agent, dispatch_agent, network_agent, photo_forensics_agent, quote_agent
from app.agents.dossier_graph import run_intake
from app.db.models import Actor, ClaimRecord, Document, Dossier, DossierEvent, Message, SubscriptionPhoto
from app.dossiers import workflow
from app.fraud_rules import consortium, engine
from app.notifications import service as notify
from app.dossiers.schemas import (
    ActorOut,
    DocumentOut,
    DossierCreate,
    DossierDetail,
    DossierSummary,
    EventOut,
    InsuredInfo,
    MessageOut,
    VehicleInfo,
)
from app.schemas import ClaimInput, FraudVerdict

UPLOAD_DIR = Path("data/uploads")

DOCUMENT_KINDS = {
    "photo_avant": "Photo face avant",
    "photo_arriere": "Photo face arrière",
    "photo_gauche": "Photo côté gauche",
    "photo_droite": "Photo côté droit",
    "photo": "Photo",
    "constat": "Constat amiable",
    "devis": "Devis garage",
    "rapport_expertise": "Rapport d'expertise",
    "facture": "Facture",
    "autre": "Document",
}

VERDICT_LABELS = {"fraud": "fraude détectée", "needs_human_review": "révision humaine", "not_fraud": "aucune fraude"}


class WorkflowError(ValueError):
    pass


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _event(db: Session, dossier_id: str, kind: str, role: str, label: str, payload: dict | None = None, at=None):
    db.add(DossierEvent(dossier_id=dossier_id, kind=kind, role=role, label=label, payload=payload or {}, at=at or utcnow()))


def _set_status(db: Session, d: Dossier, to: str, role: str, label: str | None = None, note: str | None = None, at=None):
    at = at or utcnow()
    _event(
        db,
        d.id,
        "status_change",
        role,
        label or f"Étape « {workflow.label(to)} »",
        {"from": d.status, "to": to, "note": note},
        at,
    )
    d.status = to
    d.updated_at = at
    notify.queue_status_change(db, d, to)


def _new_id(db: Session, at: datetime) -> str:
    n = db.scalar(select(func.count()).select_from(Dossier)) + 1001
    while db.get(Dossier, f"SIN-{at.year}-{n:05d}"):
        n += 1
    return f"SIN-{at.year}-{n:05d}"


def _actor(db: Session, actor_id: str | None) -> Actor | None:
    return db.get(Actor, actor_id) if actor_id else None


def _photo_alerts(db: Session, dossier_id: str) -> int:
    docs = db.execute(select(Document.analysis).where(Document.dossier_id == dossier_id)).scalars()
    return sum(1 for a in docs if a.get("verdict") == "suspect")


def refresh_copilot(db: Session, d: Dossier, pool: list[Dossier] | None = None) -> None:
    """Re-runs the rules engine then the Copilot (which reads the rules outcome)."""
    rules = engine.evaluate_dossier(db, d, pool)
    d.ai_json = {**(d.ai_json or {}), "rules": rules}
    notify.queue_fraud_alert(db, d, rules)
    verdict = d.verdict_json or {}
    dispatch = (d.ai_json or {}).get("dispatch") or []
    ctx = {
        "id": d.id,
        "status": d.status,
        "status_label": workflow.label(d.status),
        "insured_name": d.insured_json["name"],
        "city": d.city,
        "incident_type": d.claim_json["incident_type"],
        "claim_amount": d.claim_json["claim_amount"],
        "risk_score": verdict.get("risk_assessment", {}).get("risk_score"),
        "verdict": verdict.get("final_verdict"),
        "red_flags": verdict.get("investigation", {}).get("red_flags", []),
        "network_level": (d.ai_json or {}).get("network", {}).get("level"),
        "quote_level": (d.ai_json or {}).get("quote", {}).get("level"),
        "photo_alerts": _photo_alerts(db, d.id),
        "top_expert": dispatch[0]["name"] if dispatch else None,
        "rules_level": rules["level"],
        "fraud_index": rules["fraud_index"],
        "top_rules": [f"{h['id']} {h['title']} : {h['evidence']}" for h in rules["hits"][:3]],
    }
    d.ai_json = {**(d.ai_json or {}), "copilot": copilot_agent.run(ctx)}


def create_dossier(db: Session, data: DossierCreate, at: datetime | None = None, extra_ai: dict | None = None) -> Dossier:
    at = at or utcnow()
    dossier_id = _new_id(db, at)
    claim = ClaimInput(
        claim_id=dossier_id,
        **data.model_dump(include=set(ClaimInput.model_fields) - {"claim_id"}),
    )

    d = Dossier(
        id=dossier_id,
        status="declare",
        claim_json=claim.model_dump(mode="json"),
        insured_json=data.insured.model_dump(),
        vehicle_json=data.vehicle.model_dump(),
        city=data.city,
        address=data.address,
        garage_id=data.garage_id,
        ai_json={"channel": data.channel, **(extra_ai or {})},
        created_at=at,
        updated_at=at,
    )
    db.add(d)
    db.flush()
    _event(db, d.id, "status_change", "assure", f"Déclaration reçue (canal {data.channel})", {"to": "declare"}, at)

    state = run_intake(db, d, claim)
    verdict: FraudVerdict = state["verdict"]
    d.verdict_json = verdict.model_dump(mode="json")
    d.ai_json = {
        **d.ai_json,
        "network": state["network"],
        "dispatch": state["dispatch"],
        "llm_fallback": bool(state["errors"]),
    }
    db.merge(
        ClaimRecord(
            claim_id=d.id,
            policy_id=claim.policy_id,
            final_verdict=verdict.final_verdict,
            risk_score=verdict.risk_assessment.risk_score,
            verdict_json=d.verdict_json,
        )
    )

    analysed_at = at + timedelta(seconds=3)
    _set_status(
        db,
        d,
        "analyse_ia",
        "ia",
        f"Analyse IA : {VERDICT_LABELS[verdict.final_verdict]} (score {verdict.risk_assessment.risk_score:.2f})",
        at=analysed_at,
    )
    network = state["network"]
    if network["level"] != "none":
        _event(db, d.id, "alert", "ia", f"Agent Réseau : {network['summary']}", {"level": network["level"]}, analysed_at)
    if state["dispatch"]:
        top = state["dispatch"][0]
        _event(db, d.id, "agent", "ia", f"Agent Dispatch : expert recommandé {top['name']} ({top['score']} pts)", {}, analysed_at)

    refresh_copilot(db, d)
    refresh_linked(db, d)
    db.commit()
    return d


def refresh_linked(db: Session, d: Dossier) -> None:
    """A new file can change its neighbours' network/similarity rules: re-evaluate them."""
    for link in network_agent.analyze(db, d)["links"]:
        other = db.get(Dossier, link["dossier_id"])
        if other is not None:
            refresh_copilot(db, other)


def assign_expert(db: Session, d: Dossier, expert_id: str, role: str, at: datetime | None = None) -> Dossier:
    expert = _actor(db, expert_id)
    if expert is None or expert.role != "expert":
        raise WorkflowError(f"Expert inconnu : {expert_id}")
    if d.status in workflow.TERMINAL:
        raise WorkflowError("Dossier clôturé")
    at = at or utcnow()
    d.expert_id = expert.id
    notify.queue_mission(db, d, expert)
    _event(db, d.id, "assignment", role, f"Expert missionné : {expert.name} ({expert.city})", {"expert_id": expert.id}, at)
    if d.status in ("declare", "analyse_ia"):
        _set_status(db, d, "expert_missionne", role, at=at)
    refresh_copilot(db, d)
    db.commit()
    return d


def advance(db: Session, d: Dossier, to: str, role: str, note: str | None = None, at: datetime | None = None) -> Dossier:
    if to not in workflow.allowed_next(d.status):
        raise WorkflowError(f"Transition impossible : {d.status} → {to}")
    if to == "expert_missionne" and not d.expert_id:
        top = ((d.ai_json or {}).get("dispatch") or [None])[0]
        if top is None:
            raise WorkflowError("Aucun expert disponible : missionnez un expert manuellement")
        return assign_expert(db, d, top["expert_id"], role, at)
    _set_status(db, d, to, role, note=note, at=at)
    if to == "rejete":
        shared = consortium.report(db, d, note or "Fraude confirmée")
        if shared:
            _event(db, d.id, "agent", "ia", f"Base mutualisée : {shared} identifiant(s) partagé(s) de façon pseudonymisée", {}, at)
    refresh_copilot(db, d)
    db.commit()
    return d


def author_for(db: Session, d: Dossier, role: str, user_email: str | None) -> str:
    if role == "assure":
        return d.insured_json["name"]
    if role in ("expert", "garage", "agent"):
        actor = _actor(db, getattr(d, f"{role}_id"))
        return actor.name if actor else role.capitalize()
    return user_email or "Gestionnaire"


def add_message(db: Session, d: Dossier, role: str, author: str, text: str, at: datetime | None = None) -> Message:
    msg = Message(dossier_id=d.id, role=role, author=author, text=text.strip(), at=at or utcnow())
    db.add(msg)
    db.commit()
    return msg


def add_document(
    db: Session,
    d: Dossier,
    role: str,
    kind: str,
    filename: str,
    content_type: str,
    content: bytes,
    amount: float | None = None,
    at: datetime | None = None,
) -> Document:
    if kind not in DOCUMENT_KINDS:
        raise WorkflowError(f"Type de document inconnu : {kind}")
    at = at or utcnow()

    folder = UPLOAD_DIR / d.id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{uuid.uuid4().hex}{Path(filename).suffix.lower()[:10]}"
    path.write_bytes(content)

    image_hash, analysis = None, {}
    if content_type.startswith("image/"):
        claim_date = datetime.fromisoformat(d.claim_json["claim_date"]).date()
        image_hash, analysis = photo_forensics_agent.analyze(content, claim_date, d.id, db)
        reference = subscription_photo(db, d.vehicle_json["plate"], kind)
        if analysis and reference:
            comparison = damage_agent.compare(content, reference.path, path.with_name(f"{path.stem}_heatmap.jpg"))
            comparison["reference_id"] = reference.id
            analysis["comparison"] = comparison
            analysis["flags"] = analysis["flags"] + comparison["flags"]
            if any(f["level"] == "high" for f in comparison["flags"]):
                analysis["verdict"] = "suspect"

    doc = Document(
        dossier_id=d.id,
        role=role,
        kind=kind,
        filename=filename,
        path=str(path),
        content_type=content_type,
        image_hash=image_hash,
        analysis=analysis,
        at=at,
    )
    db.add(doc)
    _event(db, d.id, "document", role, f"{DOCUMENT_KINDS[kind]} ajouté(e)", {"filename": filename}, at)
    for flag in analysis.get("flags", []):
        if flag["level"] in ("high", "medium") and "EXIF absentes" not in flag["text"]:
            _event(db, d.id, "alert", "ia", f"Agent Photo : {flag['text']}", {"level": flag["level"]}, at)

    if kind == "devis" and amount:
        quote = quote_agent.analyze(db, d, amount)
        doc.analysis = {**doc.analysis, "quote": quote}
        d.quote_amount = amount
        d.ai_json = {**(d.ai_json or {}), "quote": quote}
        if quote["level"] != "ok":
            _event(db, d.id, "alert", "ia", f"Agent Devis : {quote['flags'][0]}", {"level": quote["level"]}, at)
        if d.status == "expert_missionne":
            _set_status(db, d, "validation_devis", role, f"Devis reçu : {amount:,.0f} DT".replace(",", " "), at=at)

    db.flush()
    refresh_copilot(db, d)
    db.commit()
    return doc


def normalize_plate(plate: str) -> str:
    return "".join(c for c in plate.upper() if c.isalnum())


def subscription_photo(db: Session, plate: str, kind: str) -> SubscriptionPhoto | None:
    return db.execute(
        select(SubscriptionPhoto).where(SubscriptionPhoto.plate == normalize_plate(plate), SubscriptionPhoto.kind == kind)
    ).scalars().first()


# --- read models ----------------------------------------------------------------------


def _stage_entered(db: Session, ids: list[str]) -> dict[str, datetime]:
    if not ids:
        return {}
    rows = db.execute(
        select(DossierEvent.dossier_id, func.max(DossierEvent.at))
        .where(DossierEvent.kind == "status_change", DossierEvent.dossier_id.in_(ids))
        .group_by(DossierEvent.dossier_id)
    ).all()
    return dict(rows)


def _alerts(d: Dossier, network_level: str, photo_alerts: int) -> int:
    ai = d.ai_json or {}
    return (
        int(ai.get("rules", {}).get("level") == "high")
        + int((d.verdict_json or {}).get("final_verdict") == "fraud")
        + int(network_level == "high")
        + photo_alerts
        + int(ai.get("quote", {}).get("level") == "high")
    )


def to_summary(
    d: Dossier, actors: dict[str, Actor], stage_entered: datetime | None, network_level: str, photo_alerts: int
) -> DossierSummary:
    verdict = d.verdict_json or {}
    expert, garage = actors.get(d.expert_id or ""), actors.get(d.garage_id or "")
    return DossierSummary(
        id=d.id,
        status=d.status,
        status_label=workflow.label(d.status),
        created_at=d.created_at,
        updated_at=d.updated_at,
        stage_entered_at=stage_entered or d.updated_at,
        sla_hours=workflow.STAGE_BY_KEY[d.status].sla_hours,
        city=d.city,
        insured_name=d.insured_json["name"],
        plate=d.vehicle_json["plate"],
        make_model=d.vehicle_json["make_model"],
        incident_type=d.claim_json["incident_type"],
        claim_amount=d.claim_json["claim_amount"],
        quote_amount=d.quote_amount,
        risk_score=verdict.get("risk_assessment", {}).get("risk_score"),
        verdict=verdict.get("final_verdict"),
        expert_name=expert.name if expert else None,
        garage_name=garage.name if garage else None,
        network_level=network_level,
        alerts=_alerts(d, network_level, photo_alerts),
        fraud_index=(d.ai_json or {}).get("rules", {}).get("fraud_index"),
        rules_level=(d.ai_json or {}).get("rules", {}).get("level", "none"),
        from_constat=(d.ai_json or {}).get("constat", {}).get("id"),
    )


def list_summaries(db: Session, visible: Callable[[Dossier], bool] | None = None) -> list[DossierSummary]:
    pool = db.execute(select(Dossier).order_by(Dossier.created_at.desc())).scalars().all()
    dossiers = [d for d in pool if visible is None or visible(d)]
    actors = {a.id: a for a in db.execute(select(Actor)).scalars()}
    entered = _stage_entered(db, [d.id for d in dossiers])
    photo_alerts: dict[str, int] = {}
    for dossier_id, analysis in db.execute(select(Document.dossier_id, Document.analysis)).all():
        photo_alerts[dossier_id] = photo_alerts.get(dossier_id, 0) + int(analysis.get("verdict") == "suspect")
    return [
        to_summary(d, actors, entered.get(d.id), network_agent.analyze(db, d, pool)["level"], photo_alerts.get(d.id, 0))
        for d in dossiers
    ]


def _actor_out(a: Actor | None) -> ActorOut | None:
    return ActorOut.model_validate(a, from_attributes=True) if a else None


def to_detail(db: Session, d: Dossier) -> DossierDetail:
    actors = {a.id: a for a in db.execute(select(Actor)).scalars()}
    network = network_agent.analyze(db, d)
    verdict = d.verdict_json
    dispatch = (
        dispatch_agent.rank_experts(db, d, (verdict or {}).get("final_verdict"))
        if d.status in ("declare", "analyse_ia")
        else (d.ai_json or {}).get("dispatch", [])
    )
    events = db.execute(select(DossierEvent).where(DossierEvent.dossier_id == d.id).order_by(DossierEvent.at, DossierEvent.id)).scalars()
    messages = db.execute(select(Message).where(Message.dossier_id == d.id).order_by(Message.at, Message.id)).scalars()
    documents = db.execute(select(Document).where(Document.dossier_id == d.id).order_by(Document.at, Document.id)).scalars().all()
    photo_alerts = sum(1 for doc in documents if doc.analysis.get("verdict") == "suspect")

    summary = to_summary(d, actors, _stage_entered(db, [d.id]).get(d.id), network["level"], photo_alerts)
    return DossierDetail(
        **summary.model_dump(),
        claim=d.claim_json,
        insured=InsuredInfo(**d.insured_json),
        vehicle=VehicleInfo(**d.vehicle_json),
        address=d.address,
        agent=_actor_out(actors.get(d.agent_id or "")),
        expert=_actor_out(actors.get(d.expert_id or "")),
        garage=_actor_out(actors.get(d.garage_id or "")),
        fraud=FraudVerdict.model_validate(verdict) if verdict else None,
        ai={**(d.ai_json or {}), "network": network, "dispatch": dispatch},
        allowed_next=workflow.allowed_next(d.status),
        events=[EventOut.model_validate(e, from_attributes=True) for e in events],
        messages=[MessageOut.model_validate(m, from_attributes=True) for m in messages],
        documents=[DocumentOut.model_validate(doc, from_attributes=True) for doc in documents],
    )
