"""Expert Dispatch Agent: ranks experts for a claim file and explains each score."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Actor, Dossier

OPEN_EXPERT_STAGES = ("expert_missionne", "validation_devis")


def rank_experts(db: Session, dossier: Dossier, verdict: str | None, top: int = 3) -> list[dict]:
    experts = db.execute(select(Actor).where(Actor.role == "expert")).scalars().all()
    workloads = dict(
        db.execute(
            select(Dossier.expert_id, func.count())
            .where(Dossier.status.in_(OPEN_EXPERT_STAGES), Dossier.expert_id.is_not(None))
            .group_by(Dossier.expert_id)
        ).all()
    )
    incident_type = dossier.claim_json["incident_type"]
    suspicious = verdict in ("fraud", "needs_human_review")

    ranked = []
    for e in experts:
        score, reasons = 0.0, []
        if e.city == dossier.city:
            score += 35
            reasons.append(f"Basé à {e.city}")
        if incident_type in e.specialties:
            score += 20
            reasons.append(f"Spécialiste « {incident_type} »")
        if suspicious and "fraude" in e.specialties:
            score += 25
            reasons.append("Habilité enquêtes fraude (dossier à risque)")
        score += e.rating * 5
        load = workloads.get(e.id, 0)
        score -= load * 7
        reasons.append(f"Note {e.rating:.1f}/5 · {load} dossier(s) en cours")
        ranked.append(
            {
                "expert_id": e.id,
                "name": e.name,
                "city": e.city,
                "score": round(max(score, 0), 1),
                "workload": load,
                "reasons": reasons,
            }
        )

    ranked.sort(key=lambda r: r["score"], reverse=True)
    return ranked[:top]
