"""Digital accident report: driver A declares (with voice transcript, geolocation and
photos), shares a link/QR code with driver B who completes and signs; once both have
signed, the report is analysed (liability scale + consistency checks) and sealed with a
SHA-256 fingerprint. It can then be turned into a claim file."""
import base64
import hashlib
import json
import secrets
import uuid
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents import circumstance_agent, responsibility_agent
from app.constat.schemas import ConstatCreate, ConstatFileOut, ConstatOut, ConvertRequest, Party, PublicConstat, Signature
from app.db.models import Constat, ConstatFile, Contract, Dossier
from app.dossiers import service as dossier_service
from app.dossiers.schemas import DossierCreate, InsuredInfo, VehicleInfo

UPLOAD_DIR = Path("data/uploads/constats")


class ConstatError(ValueError):
    pass


def _new_id(db: Session, at: datetime) -> str:
    n = db.scalar(select(func.count()).select_from(Constat)) + 1
    while db.get(Constat, f"CST-{at.year}-{n:04d}"):
        n += 1
    return f"CST-{at.year}-{n:04d}"


def lookup_contract(db: Session, policy_id: str, plate: str) -> dict:
    """Identifies the vehicle by contract number + plate, as on the paper form."""
    contract = db.get(Contract, policy_id.strip().upper())
    if contract is None:
        raise ConstatError("Contrat introuvable")
    plate_ok = dossier_service.normalize_plate(contract.plate) == dossier_service.normalize_plate(plate)
    if not plate_ok:
        raise ConstatError("L'immatriculation ne correspond pas à ce contrat")
    today = dossier_service.utcnow().date()
    return {
        "policy_id": contract.policy_id,
        "holder_name": contract.holder_name,
        "phone": contract.phone,
        "cin": contract.cin,
        "email": contract.email,
        "plate": contract.plate,
        "make_model": contract.make_model,
        "year": contract.year,
        "insurer": contract.insurer,
        "start_date": contract.start_date.isoformat(),
        "end_date": contract.end_date.isoformat(),
        "valid": contract.start_date <= today <= contract.end_date,
    }


def create(db: Session, data: ConstatCreate, at: datetime | None = None) -> Constat:
    at = at or dossier_service.utcnow()
    extraction = circumstance_agent.extract(data.transcript_a or "")
    party_a = data.party_a.model_dump()
    if not party_a["cases"]:
        party_a["cases"] = extraction["cases_a"]
    if not party_a["damage"]:
        party_a["damage"] = extraction["damage_a"]
    c = Constat(
        id=_new_id(db, at),
        token=secrets.token_urlsafe(16),
        status="attente_conducteur_b",
        created_at=at,
        accident_at=data.accident_at.replace(tzinfo=None),
        lat=data.lat,
        lng=data.lng,
        address=data.address,
        city=data.city,
        party_a=party_a,
        witnesses=[w.model_dump() for w in data.witnesses],
        transcript_a=data.transcript_a,
        analysis={"extraction": extraction},
    )
    db.add(c)
    db.commit()
    return c


def _save_file(db: Session, c: Constat, party: str, kind: str, content: bytes, content_type: str, suffix: str, analysis: dict | None = None) -> ConstatFile:
    folder = UPLOAD_DIR / c.id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{uuid.uuid4().hex}{suffix}"
    path.write_bytes(content)
    f = ConstatFile(constat_id=c.id, party=party, kind=kind, path=str(path), content_type=content_type, analysis=analysis or {})
    db.add(f)
    db.flush()
    return f


def add_file(db: Session, c: Constat, party: str, kind: str, filename: str, content_type: str, content: bytes) -> ConstatFile:
    if kind not in ("photo", "vocal"):
        raise ConstatError("Type de fichier inconnu")
    f = _save_file(db, c, party, kind, content, content_type, Path(filename).suffix.lower()[:10] or ".bin")
    db.commit()
    return f


def _store_signature(db: Session, c: Constat, party: str, sig: Signature) -> dict:
    header, _, b64 = sig.image.partition(",")
    if not header.startswith("data:image/png") or not b64:
        raise ConstatError("Signature invalide")
    png = base64.b64decode(b64)
    if len(png) > 500_000:
        raise ConstatError("Signature trop volumineuse")
    f = _save_file(db, c, party, "signature", png, "image/png", ".png")
    return {
        "signed_at": dossier_service.utcnow().isoformat(),
        "file_id": f.id,
        "sha256": hashlib.sha256(png).hexdigest(),
        "lat": sig.lat,
        "lng": sig.lng,
    }


def _finalize_if_complete(c: Constat) -> None:
    if not (c.signature_a and c.signature_b and c.party_b):
        c.status = "attente_signature_a" if c.party_b else "attente_conducteur_b"
        return
    responsibility = responsibility_agent.decide(c.party_a.get("cases", []), c.party_b.get("cases", []))
    coherence = responsibility_agent.coherence(c, c.created_at)
    c.analysis = {**c.analysis, "responsibility": responsibility, "coherence": coherence}
    payload = {
        "id": c.id,
        "accident_at": c.accident_at.isoformat(),
        "location": [c.lat, c.lng, c.address, c.city],
        "party_a": c.party_a,
        "party_b": c.party_b,
        "witnesses": c.witnesses,
        "signatures": [c.signature_a["sha256"], c.signature_b["sha256"]],
    }
    # Tamper-evidence: any later change to the content would no longer match this seal.
    c.seal = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    c.status = "signe"


def sign_a(db: Session, c: Constat, sig: Signature) -> Constat:
    if c.signature_a:
        raise ConstatError("Déjà signé par le conducteur A")
    c.signature_a = _store_signature(db, c, "a", sig)
    _finalize_if_complete(c)
    db.commit()
    return c


def submit_b(db: Session, c: Constat, party_b: Party, sig: Signature) -> Constat:
    if c.party_b:
        raise ConstatError("Le conducteur B a déjà complété ce constat")
    c.party_b = party_b.model_dump()
    c.signature_b = _store_signature(db, c, "b", sig)
    _finalize_if_complete(c)
    db.commit()
    return c


def convert(db: Session, c: Constat, req: ConvertRequest, at: datetime | None = None) -> Dossier:
    """Creates the claim file from driver A's side of a signed report."""
    if c.dossier_id:
        raise ConstatError(f"Déjà transformé en dossier {c.dossier_id}")
    if c.status != "signe":
        raise ConstatError("Le constat doit être signé par les deux conducteurs")
    a = c.party_a
    contract = db.get(Contract, (a.get("policy_id") or "").upper())
    accident_day: date = c.accident_at.date()
    prior = db.scalar(
        select(func.count()).select_from(Dossier).where(Dossier.claim_json["policy_id"].as_string() == (a.get("policy_id") or ""))
    )
    payload = DossierCreate(
        policy_id=a.get("policy_id") or "INCONNU",
        claim_amount=req.claim_amount,
        claim_date=accident_day,
        incident_type="collision",
        days_since_policy_start=max(0, (accident_day - contract.start_date).days) if contract else 365,
        prior_claims_count=prior or 0,
        vehicle_age=(accident_day.year - contract.year) if contract and contract.year else None,
        claim_description=c.transcript_a or a.get("observations"),
        insured=InsuredInfo(name=a["name"], phone=a["phone"], email=a.get("email"), cin=a.get("cin")),
        vehicle=VehicleInfo(plate=a["plate"], make_model=a["make_model"], year=contract.year if contract else None),
        city=c.city,
        address=c.address,
        garage_id=req.garage_id,
        channel="mobile",
    )
    b = c.party_b or {}
    third_parties = [{"role": "conducteur B", "name": b.get("name"), "phone": b.get("phone"), "cin": b.get("cin"), "plate": b.get("plate")}]
    third_parties += [{"role": "témoin", **w} for w in c.witnesses]
    constat_summary = {
        "id": c.id,
        "seal": c.seal,
        "responsibility": c.analysis.get("responsibility"),
        "coherence": c.analysis.get("coherence", []),
        "third_parties": third_parties,
        "transcript": c.transcript_a,
        "location": {"lat": c.lat, "lng": c.lng, "address": c.address},
        "accident_at": c.accident_at.isoformat(),
        "signed_b": bool(c.signature_b),
    }
    d = dossier_service.create_dossier(db, payload, at=at, extra_ai={"constat": constat_summary})
    for f in db.execute(select(ConstatFile).where(ConstatFile.constat_id == c.id, ConstatFile.party == "a", ConstatFile.kind == "photo")).scalars():
        dossier_service.add_document(db, d, "assure", "photo", Path(f.path).name, f.content_type, Path(f.path).read_bytes(), at=at)
    c.dossier_id = d.id
    c.status = "converti"
    db.commit()
    return d


def files_of(db: Session, c: Constat) -> list[ConstatFile]:
    return list(db.execute(select(ConstatFile).where(ConstatFile.constat_id == c.id).order_by(ConstatFile.id)).scalars())


def to_out(db: Session, c: Constat) -> ConstatOut:
    return ConstatOut(
        id=c.id,
        token=c.token,
        status=c.status,
        created_at=c.created_at,
        accident_at=c.accident_at,
        lat=c.lat,
        lng=c.lng,
        address=c.address,
        city=c.city,
        party_a=c.party_a,
        party_b=c.party_b,
        witnesses=c.witnesses,
        transcript_a=c.transcript_a,
        signed_a=bool(c.signature_a),
        signed_b=bool(c.signature_b),
        analysis=c.analysis,
        seal=c.seal,
        dossier_id=c.dossier_id,
        files=[ConstatFileOut.model_validate(f, from_attributes=True) for f in files_of(db, c) if f.kind != "signature"],
    )


def to_public(c: Constat) -> PublicConstat:
    a = c.party_a
    return PublicConstat(
        id=c.id,
        status=c.status,
        accident_at=c.accident_at,
        address=c.address,
        city=c.city,
        lat=c.lat,
        lng=c.lng,
        vehicle_a={"plate": a["plate"], "make_model": a["make_model"], "insurer": a.get("insurer")},
        cases_a=a.get("cases", []),
        damage_a=a.get("damage", []),
        signed_b=bool(c.signature_b),
    )
