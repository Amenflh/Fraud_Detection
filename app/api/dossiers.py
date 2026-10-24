from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import network_agent
from app.auth import get_current_user
from app.db.engine import get_db
from app.db.models import Actor, Document, Dossier
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

router = APIRouter(dependencies=[Depends(get_current_user)])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _get_dossier(db: Session, dossier_id: str) -> Dossier:
    d = db.get(Dossier, dossier_id)
    if d is None:
        raise HTTPException(status_code=404, detail=f"Dossier {dossier_id} introuvable")
    return d


@router.get("/workflow")
def get_workflow() -> dict:
    return {
        "stages": [vars(s) for s in workflow.STAGES],
        "rejected": vars(workflow.REJECTED),
        "document_kinds": service.DOCUMENT_KINDS,
    }


@router.get("/actors", response_model=list[ActorOut])
def list_actors(role: str | None = None, db: Session = Depends(get_db)) -> list[Actor]:
    query = select(Actor).order_by(Actor.name)
    if role:
        query = query.where(Actor.role == role)
    return list(db.execute(query).scalars())


@router.post("/dossiers", response_model=DossierDetail, status_code=201)
def create_dossier(payload: DossierCreate, db: Session = Depends(get_db)) -> DossierDetail:
    if payload.garage_id and (db.get(Actor, payload.garage_id) is None):
        raise HTTPException(status_code=422, detail="Garage inconnu")
    return service.to_detail(db, service.create_dossier(db, payload))


@router.get("/dossiers", response_model=DossiersList)
def list_dossiers(db: Session = Depends(get_db)) -> DossiersList:
    summaries = service.list_summaries(db)
    return DossiersList(dossiers=summaries, total=len(summaries))


@router.get("/dossiers/{dossier_id}", response_model=DossierDetail)
def get_dossier(dossier_id: str, db: Session = Depends(get_db)) -> DossierDetail:
    return service.to_detail(db, _get_dossier(db, dossier_id))


@router.post("/dossiers/{dossier_id}/advance", response_model=DossierDetail)
def advance(dossier_id: str, body: AdvanceRequest, db: Session = Depends(get_db)) -> DossierDetail:
    d = _get_dossier(db, dossier_id)
    try:
        service.advance(db, d, body.status, body.role, body.note)
    except service.WorkflowError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return service.to_detail(db, d)


@router.post("/dossiers/{dossier_id}/assign-expert", response_model=DossierDetail)
def assign_expert(dossier_id: str, body: AssignExpertRequest, db: Session = Depends(get_db)) -> DossierDetail:
    d = _get_dossier(db, dossier_id)
    try:
        service.assign_expert(db, d, body.expert_id, body.role)
    except service.WorkflowError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return service.to_detail(db, d)


@router.get("/dossiers/{dossier_id}/messages", response_model=list[MessageOut])
def list_messages(dossier_id: str, db: Session = Depends(get_db)) -> list[MessageOut]:
    return service.to_detail(db, _get_dossier(db, dossier_id)).messages


@router.post("/dossiers/{dossier_id}/messages", response_model=MessageOut, status_code=201)
def post_message(
    dossier_id: str,
    body: MessageCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    d = _get_dossier(db, dossier_id)
    return service.add_message(db, d, body.role, service.author_for(db, d, body.role, user), body.text)


@router.post("/dossiers/{dossier_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    dossier_id: str,
    file: UploadFile = File(...),
    kind: str = Form(...),
    role: Role = Form("gestionnaire"),
    amount: float | None = Form(None),
    db: Session = Depends(get_db),
):
    d = _get_dossier(db, dossier_id)
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (10 Mo max)")
    try:
        return service.add_document(
            db, d, role, kind, file.filename or "fichier", file.content_type or "application/octet-stream", content, amount
        )
    except service.WorkflowError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/documents/{document_id}/file")
def download_document(document_id: int, db: Session = Depends(get_db)) -> FileResponse:
    doc = db.get(Document, document_id)
    if doc is None or not Path(doc.path).exists():
        raise HTTPException(status_code=404, detail="Document introuvable")
    return FileResponse(doc.path, media_type=doc.content_type, filename=doc.filename)


@router.get("/network")
def get_network(db: Session = Depends(get_db)) -> dict:
    return network_agent.build_graph(db)


@router.get("/kpis/workflow")
def get_workflow_kpis(db: Session = Depends(get_db)) -> dict:
    return kpis.compute(db)
