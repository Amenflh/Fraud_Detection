"""Notification outbox.

Business code calls `queue_*` inside its own transaction (so a notification exists if and only
if the change was committed). `dispatch_pending` then delivers rows through the providers, with
retries; a provider outage marks rows "failed" but never breaks the request that caused them.
"""
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db.models import Actor, Dossier, Notification
from app.notifications import providers, templates

log = logging.getLogger("notifications")

MAX_ATTEMPTS = 3
ALLOWED_STATUSES = ("pending", "failed")


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _link(dossier_id: str) -> str:
    return f"{get_settings().public_app_url.rstrip('/')}/dossiers/{dossier_id}"


def _add(
    db: Session,
    *,
    dossier_id: str | None,
    channel: str,
    recipient: str,
    role: str,
    kind: str,
    body: str,
    subject: str | None = None,
    html: str | None = None,
    dedupe_key: str | None = None,
) -> Notification | None:
    if not get_settings().notifications_enabled or not recipient:
        return None
    if dedupe_key and db.scalar(select(Notification.id).where(Notification.dedupe_key == dedupe_key)):
        return None  # already queued: re-running the same business step must not message twice
    n = Notification(
        dossier_id=dossier_id,
        channel=channel,
        recipient=recipient,
        recipient_role=role,
        kind=kind,
        subject=subject,
        body=body,
        html=html,
        dedupe_key=dedupe_key,
        created_at=_now(),
    )
    db.add(n)
    db.flush()  # sessions here run with autoflush off: make the row visible to the dedupe query
    return n


def _first_name(full_name: str) -> str:
    return (full_name or "").split()[0] if full_name else ""


def queue_status_change(db: Session, d: Dossier, status: str) -> list[Notification]:
    """Informs the insured at each milestone (the customer-facing promise of the platform)."""
    expert = db.get(Actor, d.expert_id) if d.expert_id else None
    garage = db.get(Actor, d.garage_id) if d.garage_id else None
    msg = templates.status_message(
        status, d.id, _first_name(d.insured_json["name"]), _link(d.id), expert.name if expert else None, garage.name if garage else None
    )
    if msg is None:
        return []
    out = []
    email, phone = d.insured_json.get("email"), d.insured_json.get("phone")
    if email:
        out.append(_add(db, dossier_id=d.id, channel="email", recipient=email, role="assure", kind=f"status:{status}",
                        subject=msg["subject"], body=msg["text"], html=msg["html"], dedupe_key=f"status:{d.id}:{status}:email"))
    if phone:
        out.append(_add(db, dossier_id=d.id, channel="sms", recipient=phone, role="assure", kind=f"status:{status}",
                        body=msg["sms"], dedupe_key=f"status:{d.id}:{status}:sms"))
    return [n for n in out if n]


def queue_mission(db: Session, d: Dossier, expert: Actor) -> list[Notification]:
    """Tells an expert they received a mission."""
    msg = templates.mission_message(d.id, expert.name, d.city, d.claim_json["incident_type"], _link(d.id))
    out = []
    if expert.email:
        out.append(_add(db, dossier_id=d.id, channel="email", recipient=expert.email, role="expert", kind="mission",
                        subject=msg["subject"], body=msg["text"], html=msg["html"], dedupe_key=f"mission:{d.id}:{expert.id}:email"))
    if expert.phone:
        out.append(_add(db, dossier_id=d.id, channel="sms", recipient=expert.phone, role="expert", kind="mission",
                        body=msg["sms"], dedupe_key=f"mission:{d.id}:{expert.id}:sms"))
    return [n for n in out if n]


def queue_fraud_alert(db: Session, d: Dossier, rules: dict) -> list[Notification]:
    """E-mails the managers once per file when the rules score reaches the configured threshold."""
    settings = get_settings()
    if rules.get("score", 0) < settings.fraud_alert_threshold:
        return []
    msg = templates.fraud_alert_message(d.id, rules["fraud_index"], rules["score"], rules["hits"], _link(d.id))
    out = [
        _add(db, dossier_id=d.id, channel="email", recipient=addr, role="gestionnaire", kind="fraud-alert",
             subject=msg["subject"], body=msg["text"], html=msg["html"], dedupe_key=f"fraud-alert:{d.id}:{addr}")
        for addr in settings.alert_email_list
    ]
    return [n for n in out if n]


def queue_manual(db: Session, d: Dossier, text: str, channels: list[str]) -> list[Notification]:
    msg = templates.manual_message(d.id, _first_name(d.insured_json["name"]), text, _link(d.id))
    out = []
    if "email" in channels and d.insured_json.get("email"):
        out.append(_add(db, dossier_id=d.id, channel="email", recipient=d.insured_json["email"], role="assure", kind="manual",
                        subject=msg["subject"], body=msg["text"], html=msg["html"]))
    if "sms" in channels and d.insured_json.get("phone"):
        out.append(_add(db, dossier_id=d.id, channel="sms", recipient=d.insured_json["phone"], role="assure", kind="manual", body=msg["sms"]))
    return [n for n in out if n]


def _allowed(recipient: str) -> bool:
    allow = [a.strip().lower().replace(" ", "") for a in get_settings().notify_allowlist.split(",") if a.strip()]
    return not allow or recipient.strip().lower().replace(" ", "") in allow


def deliver(n: Notification) -> None:
    """Sends one notification and records the outcome on the row."""
    settings = get_settings()
    n.attempts += 1
    if not _allowed(n.recipient):
        n.status, n.error = "skipped", "Destinataire hors liste blanche (NOTIFY_ALLOWLIST)"
        return
    try:
        if n.channel == "email":
            provider = providers.send_email(settings, n.recipient, n.subject or "", n.body, n.html)
        else:
            provider = providers.send_sms(settings, n.recipient, n.body)
    except providers.DeliveryError as exc:
        n.status, n.error = ("failed" if n.attempts >= MAX_ATTEMPTS else "pending"), str(exc)[:500]
        log.warning("notification %s (%s) failed: %s", n.id, n.channel, exc)
        return
    n.provider = provider
    n.status = "simulated" if provider == "console" else "sent"
    n.error = None
    n.sent_at = _now()


def dispatch_pending(session_factory: sessionmaker, limit: int = 50) -> int:
    """Delivers queued notifications. Meant for a background task or a periodic worker."""
    db = session_factory()
    try:
        rows = db.execute(
            select(Notification).where(Notification.status == "pending", Notification.attempts < MAX_ATTEMPTS).order_by(Notification.id).limit(limit)
        ).scalars().all()
        for n in rows:
            deliver(n)
            db.commit()  # commit per message: a crash never re-sends the ones already delivered
        return len(rows)
    finally:
        db.close()


def retry(db: Session, notification: Notification) -> None:
    notification.status, notification.attempts, notification.error = "pending", 0, None
    db.commit()


def status() -> dict:
    s = get_settings()
    return {
        "enabled": s.notifications_enabled,
        "email": {"configured": s.email_configured, "provider": "smtp" if s.email_configured else "console", "from": s.smtp_from},
        "sms": {"configured": s.sms_configured, "provider": "twilio" if s.sms_configured else "console"},
        "alert_recipients": len(s.alert_email_list),
        "alert_threshold": s.fraud_alert_threshold,
        "allowlist": bool(s.notify_allowlist.strip()),
    }
