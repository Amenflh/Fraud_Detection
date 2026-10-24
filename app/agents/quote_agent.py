"""Quote Agent: benchmarks a garage quote against comparable claim files to spot overbilling.

Quotes are compared relative to the damage declared by the insured (quote / declared
amount), so a large claim is not flagged just for being large.
"""
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Dossier

WARNING_RATIO = 1.25
HIGH_RATIO = 1.5
MIN_COMPARABLES = 3
DEFAULT_QUOTE_TO_CLAIM = 1.0


def analyze(db: Session, dossier: Dossier, amount: float) -> dict:
    incident_type = dossier.claim_json["incident_type"]
    declared = float(dossier.claim_json["claim_amount"])

    rows = db.execute(
        select(Dossier.quote_amount, Dossier.claim_json).where(Dossier.id != dossier.id, Dossier.quote_amount.is_not(None))
    ).all()
    same_type = [q / c["claim_amount"] for q, c in rows if c.get("incident_type") == incident_type and c.get("claim_amount")]
    any_type = [q / c["claim_amount"] for q, c in rows if c.get("claim_amount")]

    if len(same_type) >= MIN_COMPARABLES:
        typical, comparables, basis = median(same_type), len(same_type), f"{len(same_type)} devis « {incident_type} »"
    elif len(any_type) >= MIN_COMPARABLES:
        typical, comparables, basis = median(any_type), len(any_type), f"{len(any_type)} devis tous sinistres"
    else:
        typical, comparables, basis = DEFAULT_QUOTE_TO_CLAIM, 0, "montant déclaré (pas encore de devis comparables)"

    reference = declared * typical
    ratio = amount / reference if reference else 1.0
    flags = []
    if ratio >= HIGH_RATIO:
        level = "high"
        flags.append(f"Devis à {ratio:.0%} du montant attendu ({reference:,.0f} DT) : surfacturation probable".replace(",", " "))
    elif ratio >= WARNING_RATIO:
        level = "warning"
        flags.append(f"Devis à {ratio:.0%} du montant attendu ({reference:,.0f} DT) : à justifier par le garage".replace(",", " "))
    else:
        level = "ok"

    return {
        "agent": "quote",
        "amount": round(amount, 2),
        "declared": declared,
        "reference": round(reference, 2),
        "typical_ratio": round(typical, 3),
        "basis": basis,
        "ratio": round(ratio, 3),
        "comparables": comparables,
        "level": level,
        "flags": flags,
        "potential_saving": round(max(0.0, amount - reference), 2) if level != "ok" else 0.0,
    }
