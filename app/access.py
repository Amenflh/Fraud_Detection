"""Authorisation rules for claim files: who can see what, and who can do what.

Enforced on the server (the UI only mirrors it). Two principles:
- need-to-know: an expert sees their own files, a garage theirs, an insured only theirs;
- the people being checked never see the fraud analysis: insureds and garages get a redacted
  view with no score, rules, network links, internal alerts or copilot notes.
"""
from app.auth import Principal
from app.db.models import Dossier
from app.dossiers import workflow
from app.dossiers.schemas import DossierDetail, DossierSummary

REDACTED_ROLES = ("assure", "garage")

# Workflow transitions a non-manager may perform.
ALLOWED_TRANSITIONS: dict[str, set[tuple[str, str]]] = {
    "expert": {("validation_devis", "en_reparation")},
}

# Document kinds each role may upload (the manager may upload anything).
UPLOAD_KINDS: dict[str, set[str]] = {
    "assure": {"photo_avant", "photo_arriere", "photo_gauche", "photo_droite", "photo", "constat", "autre"},
    "garage": {"devis", "facture", "photo", "autre"},
    "expert": {"rapport_expertise", "photo", "autre"},
    "agent": {"constat", "photo", "autre"},
}


def can_view(p: Principal, d: Dossier) -> bool:
    if p.is_staff:
        return True
    if p.role == "expert":
        return d.expert_id == p.actor_id
    if p.role == "garage":
        return d.garage_id == p.actor_id
    if p.role == "assure":
        return (d.insured_json.get("email") or "").strip().lower() == p.email
    return False


def can_advance(p: Principal, d: Dossier, to: str) -> bool:
    if p.is_manager:
        return True
    return (d.status, to) in ALLOWED_TRANSITIONS.get(p.role, set())


def can_upload(p: Principal, kind: str) -> bool:
    return p.is_manager or kind in UPLOAD_KINDS.get(p.role, set())


def effective_role(p: Principal, requested: str | None) -> str:
    """Role recorded on messages/documents. Only a manager may act "as" another role (the demo's
    role switcher); everyone else is pinned to the role in their token."""
    return requested if p.is_manager and requested else p.role


def allowed_next(p: Principal, d: Dossier) -> list[str]:
    return [s for s in workflow.allowed_next(d.status) if can_advance(p, d, s)]


def _neutral(summary: DossierSummary) -> None:
    summary.risk_score = None
    summary.verdict = None
    summary.fraud_index = None
    summary.rules_level = "none"
    summary.network_level = "none"
    summary.alerts = 0


def redact_summary(p: Principal, summary: DossierSummary) -> DossierSummary:
    if p.role in REDACTED_ROLES:
        _neutral(summary)
    return summary


def redact_detail(p: Principal, detail: DossierDetail) -> DossierDetail:
    if p.role not in REDACTED_ROLES:
        return detail
    _neutral(detail)
    detail.fraud = None
    detail.ai = {"channel": detail.ai.get("channel")}
    detail.expert = detail.expert if p.role == "assure" else None
    for doc in detail.documents:
        doc.analysis = {}
    kept = []
    for event in detail.events:
        if event.role == "ia":
            if event.kind != "status_change":
                continue  # internal agent / alert entries
            target = (event.payload or {}).get("to")
            if target in workflow.STAGE_BY_KEY:
                event.label = f"Étape « {workflow.label(target)} »"
        elif event.kind in ("alert", "agent"):
            continue
        kept.append(event)
    detail.events = kept
    return detail
