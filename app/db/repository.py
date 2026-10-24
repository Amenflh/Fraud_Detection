from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ClaimRecord
from app.schemas import ClaimInput, FraudVerdict


def save_verdict(db: Session, claim: ClaimInput, verdict: FraudVerdict) -> None:
    record = ClaimRecord(
        claim_id=verdict.claim_id,
        policy_id=claim.policy_id,
        final_verdict=verdict.final_verdict,
        risk_score=verdict.risk_assessment.risk_score,
        verdict_json=verdict.model_dump(mode="json"),
    )
    db.merge(record)
    db.commit()


def get_verdict(db: Session, claim_id: str) -> FraudVerdict | None:
    record = db.get(ClaimRecord, claim_id)
    return FraudVerdict.model_validate(record.verdict_json) if record else None


def list_verdicts(db: Session, limit: int = 50, offset: int = 0) -> tuple[list[FraudVerdict], int]:
    total = db.query(ClaimRecord).count()
    rows = (
        db.execute(
            select(ClaimRecord).order_by(ClaimRecord.created_at.desc()).limit(limit).offset(offset)
        )
        .scalars()
        .all()
    )
    return [FraudVerdict.model_validate(r.verdict_json) for r in rows], total


def all_verdicts(db: Session) -> list[FraudVerdict]:
    rows = db.execute(select(ClaimRecord)).scalars().all()
    return [FraudVerdict.model_validate(r.verdict_json) for r in rows]
