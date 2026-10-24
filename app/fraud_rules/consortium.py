"""Federation consortium: member companies share fraud signals without sharing personal
data. Identifiers are normalised then pseudonymised with an HMAC keyed by a secret
shared only by members, so the central registry never stores phones/CIN/plates in clear.
"""
import hashlib
import hmac
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import ConsortiumEntry, Dossier

KIND_LABELS = {"phone": "téléphone", "cin": "CIN", "email": "email", "plate": "immatriculation"}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value).lower())
    return "".join(c for c in value if c.isalnum())


def hash_identifier(kind: str, value: str) -> str:
    key = get_settings().consortium_key.encode()
    return hmac.new(key, f"{kind}:{normalize(value)}".encode(), hashlib.sha256).hexdigest()


def identifiers_of(dossier: Dossier) -> list[tuple[str, str]]:
    ids = [
        ("phone", dossier.insured_json.get("phone")),
        ("cin", dossier.insured_json.get("cin")),
        ("email", dossier.insured_json.get("email")),
        ("plate", dossier.vehicle_json.get("plate")),
    ]
    for tp in (dossier.ai_json or {}).get("constat", {}).get("third_parties", []):
        ids += [("phone", tp.get("phone")), ("cin", tp.get("cin")), ("plate", tp.get("plate"))]
    return [(k, v) for k, v in ids if v]


def lookup(db: Session, identifiers: list[tuple[str, str]]) -> list[dict]:
    if not identifiers:
        return []
    own = get_settings().company_name
    by_hash = {hash_identifier(k, v): k for k, v in identifiers}
    rows = db.execute(
        select(ConsortiumEntry).where(ConsortiumEntry.identifier_hash.in_(by_hash), ConsortiumEntry.company != own)
    ).scalars()
    return [
        {
            "kind": r.kind,
            "kind_label": KIND_LABELS.get(r.kind, r.kind),
            "company": r.company,
            "reason": r.reason,
            "reported_at": r.reported_at.isoformat(),
        }
        for r in rows
    ]


def report(db: Session, dossier: Dossier, reason: str) -> int:
    """Shares the identifiers of a confirmed fraud with the federation (pseudonymised)."""
    company = get_settings().company_name
    added = 0
    for kind, value in identifiers_of(dossier):
        h = hash_identifier(kind, value)
        exists = db.scalar(
            select(func.count()).select_from(ConsortiumEntry).where(
                ConsortiumEntry.identifier_hash == h, ConsortiumEntry.company == company
            )
        )
        if not exists:
            db.add(ConsortiumEntry(kind=kind, identifier_hash=h, company=company, reason=reason))
            added += 1
    return added


def stats(db: Session) -> dict:
    rows = db.execute(select(ConsortiumEntry).order_by(ConsortiumEntry.reported_at.desc())).scalars().all()
    by_company: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for r in rows:
        by_company[r.company] = by_company.get(r.company, 0) + 1
        by_kind[r.kind] = by_kind.get(r.kind, 0) + 1
    return {
        "total": len(rows),
        "companies": len(by_company),
        "by_company": by_company,
        "by_kind": by_kind,
        "recent": [
            {
                "hash": f"{r.identifier_hash[:10]}…",
                "kind": KIND_LABELS.get(r.kind, r.kind),
                "company": r.company,
                "reason": r.reason,
                "reported_at": r.reported_at.isoformat(),
            }
            for r in rows[:8]
        ],
        "own_company": get_settings().company_name,
    }
