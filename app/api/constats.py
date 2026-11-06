from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import circumstance_agent
from app.auth import Principal, get_principal, require_roles
from app.constat import pdf, service
from app.constat.schemas import (
    ConstatCreate,
    ConstatFileOut,
    ConstatOut,
    ConvertRequest,
    ExtractRequest,
    PartyBSubmit,
    PublicConstat,
    Signature,
)
from app.db.engine import get_db
from app.db.models import Constat, ConstatFile

# Driver A (the declaring insured) and back-office staff use the authenticated app.
router = APIRouter(dependencies=[Depends(require_roles("gestionnaire", "agent", "assure"))])
# Driver B has no account: the unguessable token in the shared link/QR is the credential.
public_router = APIRouter(prefix="/public")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _can_access(p: Principal, c: Constat) -> bool:
    return p.is_staff or (p.role == "assure" and c.owner_email == p.email)


def _get(db: Session, p: Principal, constat_id: str) -> Constat:
    c = db.get(Constat, constat_id)
    if c is None or not _can_access(p, c):
        raise HTTPException(status_code=404, detail="Constat introuvable")
    return c


def _by_token(db: Session, token: str) -> Constat:
    c = db.execute(select(Constat).where(Constat.token == token)).scalars().first()
    if c is None:
        raise HTTPException(status_code=404, detail="Lien de constat invalide ou expiré")
    return c


def _error(exc: service.ConstatError) -> HTTPException:
    return HTTPException(status_code=409, detail=str(exc))


@router.get("/contracts/lookup")
def lookup_contract(policy_id: str, plate: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> dict:
    try:
        info = service.lookup_contract(db, policy_id, plate)
    except service.ConstatError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    # An insured may only identify their own vehicle.
    if p.role == "assure" and (info.get("email") or "").lower() != p.email:
        raise HTTPException(status_code=404, detail="Contrat introuvable")
    return info


@router.post("/constats", response_model=ConstatOut, status_code=201)
def create_constat(body: ConstatCreate, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> ConstatOut:
    owner = p.email if p.role == "assure" else None
    return service.to_out(db, service.create(db, body, owner_email=owner))


@router.get("/constats", response_model=list[ConstatOut])
def list_constats(db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> list[ConstatOut]:
    rows = db.execute(select(Constat).order_by(Constat.created_at.desc())).scalars()
    return [service.to_out(db, c) for c in rows if _can_access(p, c)]


@router.get("/constats/{constat_id}", response_model=ConstatOut)
def get_constat(constat_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> ConstatOut:
    return service.to_out(db, _get(db, p, constat_id))


@router.get("/constats/{constat_id}/pdf")
def constat_pdf(constat_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> Response:
    c = _get(db, p, constat_id)
    content = pdf.render(c, service.files_of(db, c))
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="constat-{c.id}.pdf"'},
    )


@router.post("/constats/{constat_id}/files", response_model=ConstatFileOut, status_code=201)
async def upload_constat_file(
    constat_id: str,
    file: UploadFile = File(...),
    kind: str = Form(...),
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    c = _get(db, p, constat_id)
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (10 Mo max)")
    try:
        return service.add_file(db, c, "a", kind, file.filename or "fichier", file.content_type or "application/octet-stream", content)
    except service.ConstatError as exc:
        raise _error(exc) from exc


@router.post("/constats/{constat_id}/sign", response_model=ConstatOut)
def sign(constat_id: str, body: Signature, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> ConstatOut:
    c = _get(db, p, constat_id)
    try:
        service.sign_a(db, c, body)
    except service.ConstatError as exc:
        raise _error(exc) from exc
    return service.to_out(db, c)


@router.post("/constats/{constat_id}/convert")
def convert(constat_id: str, body: ConvertRequest, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> dict:
    c = _get(db, p, constat_id)
    try:
        d = service.convert(db, c, body)
    except service.ConstatError as exc:
        raise _error(exc) from exc
    return {"dossier_id": d.id}


@router.get("/constat-files/{file_id}/file")
def download_constat_file(file_id: int, db: Session = Depends(get_db), p: Principal = Depends(get_principal)) -> FileResponse:
    f = db.get(ConstatFile, file_id)
    if f is None or not Path(f.path).exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    _get(db, p, f.constat_id)
    return FileResponse(f.path, media_type=f.content_type)


@public_router.post("/extract")
def extract(body: ExtractRequest) -> dict:
    """Voice/text account -> constat boxes. Public so driver B's page can use it too."""
    return circumstance_agent.extract(body.text)


@public_router.get("/constats/{token}", response_model=PublicConstat)
def public_constat(token: str, db: Session = Depends(get_db)) -> PublicConstat:
    return service.to_public(_by_token(db, token))


@public_router.post("/constats/{token}/party-b", response_model=PublicConstat)
def submit_party_b(token: str, body: PartyBSubmit, db: Session = Depends(get_db)) -> PublicConstat:
    c = _by_token(db, token)
    try:
        service.submit_b(db, c, body.party_b, body.signature)
    except service.ConstatError as exc:
        raise _error(exc) from exc
    return service.to_public(c)


@public_router.get("/verify/{constat_id}")
def verify_constat(constat_id: str, seal: str | None = None, db: Session = Depends(get_db)) -> dict:
    """Authenticity check behind the PDF's QR code. Reveals no personal data."""
    c = db.get(Constat, constat_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Constat introuvable")
    return service.verify(db, c, seal)
