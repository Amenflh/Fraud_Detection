from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base
from app.db.repository import all_verdicts, get_verdict, list_verdicts, save_verdict
from app.schemas import ClaimInput, FraudVerdict, InvestigationNote, RiskAssessment


def _make_engine(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/repo_test.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return engine


def _make_claim_and_verdict(claim_id: str, final_verdict: str = "fraud") -> tuple[ClaimInput, FraudVerdict]:
    claim = ClaimInput(
        claim_id=claim_id,
        policy_id="P1",
        claim_amount=1000.0,
        claim_date=date(2026, 1, 1),
        incident_type="collision",
        days_since_policy_start=100,
        prior_claims_count=0,
    )
    verdict = FraudVerdict(
        claim_id=claim_id,
        final_verdict=final_verdict,
        confidence=0.9,
        report="Test report.",
        risk_assessment=RiskAssessment(risk_score=0.8, is_anomaly=True, model_used="ensemble"),
        investigation=InvestigationNote(summary="Test investigation."),
    )
    return claim, verdict


def test_save_and_get_verdict_survives_new_session(tmp_path):
    engine = _make_engine(tmp_path)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    claim, verdict = _make_claim_and_verdict("C1")
    with SessionLocal() as db:
        save_verdict(db, claim, verdict)

    with SessionLocal() as db:
        fetched = get_verdict(db, "C1")

    assert fetched is not None
    assert fetched.claim_id == "C1"
    assert fetched.final_verdict == "fraud"


def test_get_verdict_returns_none_for_unknown_claim(tmp_path):
    engine = _make_engine(tmp_path)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as db:
        assert get_verdict(db, "UNKNOWN") is None


def test_list_and_all_verdicts(tmp_path):
    engine = _make_engine(tmp_path)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as db:
        for i in range(3):
            claim, verdict = _make_claim_and_verdict(f"C{i}")
            save_verdict(db, claim, verdict)

    with SessionLocal() as db:
        all_results = all_verdicts(db)
        page, total = list_verdicts(db, limit=2, offset=0)

    assert len(all_results) == 3
    assert total == 3
    assert len(page) == 2


def test_save_verdict_upserts_on_same_claim_id(tmp_path):
    engine = _make_engine(tmp_path)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    claim, verdict_v1 = _make_claim_and_verdict("C1", final_verdict="needs_human_review")
    _, verdict_v2 = _make_claim_and_verdict("C1", final_verdict="fraud")

    with SessionLocal() as db:
        save_verdict(db, claim, verdict_v1)
        save_verdict(db, claim, verdict_v2)

    with SessionLocal() as db:
        fetched = get_verdict(db, "C1")
        total = len(all_verdicts(db))

    assert fetched.final_verdict == "fraud"
    assert total == 1
