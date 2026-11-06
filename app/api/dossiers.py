from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app import access
from app.agents import network_agent
from app.auth import Principal, get_principal, require_manager, require_roles, require_staff
from app.db.engine import get_db
from app.db.models import Actor, Document, Dossier, Notification
from app.dossiers import kpis, service, workflow
from app.dossiers.schemas import (
    ActorOut,
    AdvanceRequest,
    AssignExpertRequest,
    DocumentOut,
    DossierCreate,
    DossierDetail,
    DossiersList,
    MessageCreate,
    MessageOut,
    Role,
)
from app.notifications import service as notify

# Every route needs a valid, *role-bearing* account; finer checks are per endpoint.
router = APIRouter(dependencies=[Depends(get_principal)])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _get_dossier(db: Session, p: Principal, dossier_id: str) -> Dossier:
    d = db.get(Dossier, dossier_id)
    # 404 (not 403) for files the caller may not see: do not reveal that they exist.
    if d is None or not access.can_view(p, d):
        raise HTTPException(status_code=404, detail=f"Dossier {dossier_id} introuvable")
    return d


def _detail(db: Session, p: Principal, d: Dossier) -> DossierDetail:
    detail = service.to_detail(db, d)
    detail.allowed_next = access.allowed_next(p, d)
    return access.redact_detail(p, detail)


def _dispatch_later(background: BackgroundTasks, db: Session) -> None:
    """Delivers the notifications queued by this request after the response is sent."""
    factory = sessionmaker(bind=db.get_bind(), autoflush=False, autocommit=False)
    background.add_task(notify.dispatch_pending, factory)


@router.get("/me")
def me(p: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    actor = db.get(Actor, p.actor_id) if p.actor_id else None
    return {
        "id": p.id,
        "email": p.email,
        "role": p.role,
        "actor_id": p.actor_id,
        "actor_name": actor.name if actor else None,
    }


@router.get("/workflow")
def get_workflow() -> dict:
    return {
        "stages": [vars(s) for s in workflow.STAGES],
        "rejected": vars(workflow.REJECTED),
        "document_kinds": service.DOCUMENT_KINDS,
    }


@router.get("/actors", response_model=list[ActorOut])
def list_actors(role: str | None = None, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> list[ActorOut]:
    query = select(Actor).order_by(Actor.name)
    if role:
        query = query.where(Actor.role == role)
    out = [ActorOut.model_validate(a, from_attributes=True) for a in db.execute(query).scalars()]
    if not p.is_staff:
        for actor in out:
            actor.phone = None  # partners' contact details are for back-office use
    return out


@router.post("/dossiers", response_model=DossierDetail, status_code=201)
def create_dossier(
    payload: DossierCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    p: Principal = Depends(require_roles("gestionnaire", "agent", "assure")),
) -> DossierDetail:
    if payload.garage_id and db.get(Actor, payload.garage_id) is None:
        raise HTTPException(status_code=422, detail="Garage inconnu")
    if p.role == "assure":
        payload.insured.email = p.email  # ownership is the account's e-mail: not client-supplied
    d = service.create_dossier(db, payload)
    _dispatch_later(background, db)
    return _detail(db, p, d)


@router.get("/dossiers", response_model=DossiersList)
def list_dossiers(db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> DossiersList:
    summaries = [access.redact_summary(p, s) for s in service.list_summaries(db, visible=lambda d: access.can_view(p, d))]
    return DossiersList(dossiers=summaries, total=len(summaries))


@router.get("/dossiers/{dossier_id}", response_model=DossierDetail)
def get_dossier(dossier_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> DossierDetail:
    return _detail(db, p, _get_dossier(db, p, dossier_id))


@router.post("/dossiers/{dossier_id}/advance", response_model=DossierDetail)
def advance(
    dossier_id: str,
    body: AdvanceRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
) -> DossierDetail:
    d = _get_dossier(db, p, dossier_id)
    if not access.can_advance(p, d, body.status):
        raise HTTPException(status_code=403, detail="Cette transition n'est pas autorisée pour votre rôle.")
    try:
        service.advance(db, d, body.status, access.effective_role(p, body.role), body.note)
    except service.WorkflowError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _dispatch_later(background, db)
    return _detail(db, p, d)


@router.post("/dossiers/{dossier_id}/assign-expert", response_model=DossierDetail)
def assign_expert(
    dossier_id: str,
    body: AssignExpertRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    p: Principal = Depends(require_manager),
) -> DossierDetail:
    d = _get_dossier(db, p, dossier_id)
    try:
        service.assign_expert(db, d, body.expert_id, access.effective_role(p, body.role))
    except service.WorkflowError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _dispatch_later(background, db)
    return _detail(db, p, d)


@router.get("/dossiers/{dossier_id}/messages", response_model=list[MessageOut])
def list_messages(dossier_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> list[MessageOut]:
    return service.to_detail(db, _get_dossier(db, p, dossier_id)).messages


@router.post("/dossiers/{dossier_id}/messages", response_model=MessageOut, status_code=201)
def post_message(
    dossier_id: str,
    body: MessageCreate,
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    d = _get_dossier(db, p, dossier_id)
    role = access.effective_role(p, body.role)  # never trust a client-supplied role
    return service.add_message(db, d, role, service.author_for(db, d, role, p.email), body.text)


@router.post("/dossiers/{dossier_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    dossier_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    kind: str = Form(...),
    role: Role = Form("gestionnaire"),
    amount: float | None = Form(None),
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    d = _get_dossier(db, p, dossier_id)
    if not access.can_upload(p, kind):
        raise HTTPException(status_code=403, detail="Ce type de document n'est pas autorisé pour votre rôle.")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (10 Mo max)")
    try:
        doc = service.add_document(
            db,
            d,
            access.effective_role(p, role),
            kind,
            file.filename or "fichier",
            file.content_type or "application/octet-stream",
            content,
            amount,
        )
    except service.WorkflowError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _dispatch_later(background, db)
    out = DocumentOut.model_validate(doc, from_attributes=True)
    if p.role in access.REDACTED_ROLES:
        out.analysis = {}  # the uploader must not learn what the fraud checks found
    return out


@router.get("/documents/{document_id}/file")
def download_document(document_id: int, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> FileResponse:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document introuvable")
    _get_dossier(db, p, doc.dossier_id)  # same visibility as the file it belongs to
    if not Path(doc.path).exists():
        raise HTTPException(status_code=404, detail="Document introuvable")
    return FileResponse(doc.path, media_type=doc.content_type, filename=doc.filename)


@router.get("/network")
def get_network(db: Session = Depends(get_db), _: Principal = Depends(require_staff)) -> dict:
    return network_agent.build_graph(db)


@router.get("/kpis/workflow")
def get_workflow_kpis(db: Session = Depends(get_db), _: Principal = Depends(require_staff)) -> dict:
    return kpis.compute(db)


# --- Notifications -----------------------------------------------------------------------


class NotificationOut(BaseModel):
    id: int
    channel: str
    recipient: str
    recipient_role: str
    kind: str
    subject: str | None
    body: str
    status: str
    provider: str | None
    attempts: int
    error: str | None
    created_at: str
    sent_at: str | None


class NotifyRequest(BaseModel):
    message: str = Field(min_length=3, max_length=320)
    channels: list[str] = ["sms", "email"]


def _out(n: Notification) -> NotificationOut:
    return NotificationOut(
        id=n.id, channel=n.channel, recipient=n.recipient, recipient_role=n.recipient_role, kind=n.kind, subject=n.subject,
        body=n.body, status=n.status, provider=n.provider, attempts=n.attempts, error=n.error,
        created_at=n.created_at.isoformat(), sent_at=n.sent_at.isoformat() if n.sent_at else None,
    )


@router.get("/notifications/status")
def notifications_status(_: Principal = Depends(require_staff)) -> dict:
    return notify.status()


@router.get("/dossiers/{dossier_id}/notifications", response_model=list[NotificationOut])
def list_notifications(dossier_id: str, db: Session = Depends(get_db), p: Principal = Depends(require_staff)) -> list[NotificationOut]:
    _get_dossier(db, p, dossier_id)
    rows = db.execute(select(Notification).where(Notification.dossier_id == dossier_id).order_by(Notification.id.desc())).scalars()
    return [_out(n) for n in rows]


@router.post("/dossiers/{dossier_id}/notify", response_model=list[NotificationOut], status_code=202)
def notify_insured(
    dossier_id: str,
    body: NotifyRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    p: Principal = Depends(require_manager),
) -> list[NotificationOut]:
    d = _get_dossier(db, p, dossier_id)
    channels = [c for c in body.channels if c in ("sms", "email")]
    queued = notify.queue_manual(db, d, body.message, channels)
    if not queued:
        raise HTTPException(status_code=422, detail="Aucun destinataire : l'assuré n'a ni téléphone ni e-mail pour ces canaux.")
    db.commit()
    _dispatch_later(background, db)
    return [_out(n) for n in queued]


@router.post("/notifications/{notification_id}/retry", response_model=NotificationOut)
def retry_notification(
    notification_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_manager),
) -> NotificationOut:
    n = db.get(Notification, notification_id)
    if n is None:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    notify.retry(db, n)
    _dispatch_later(background, db)
    return _out(n)
