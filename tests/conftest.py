from datetime import date

import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import get_current_user
from app.db.engine import get_db
from app.db.models import Base
from app.schemas import ClaimInput, FraudVerdict, InvestigationNote


class _FakeStructuredRunnable:
    """Stands in for `chat_model.with_structured_output(Schema)`: returns a fixed
    instance of Schema regardless of input, with zero network calls."""

    def __init__(self, schema: type) -> None:
        self._schema = schema

    def invoke(self, messages) -> object:
        if self._schema is InvestigationNote:
            return InvestigationNote(
                summary="Fake LLM investigation note.",
                red_flags=["Fake red flag"],
                tool_calls_made=[],
            )
        if self._schema is FraudVerdict:
            return FraudVerdict(
                claim_id="placeholder",
                final_verdict="needs_human_review",
                confidence=0.6,
                report="Fake LLM report.",
                risk_assessment=_dummy_risk_assessment(),
                investigation=InvestigationNote(summary="placeholder"),
            )
        raise NotImplementedError(f"No fake response configured for schema {self._schema}")


def _dummy_risk_assessment():
    from app.schemas import RiskAssessment

    return RiskAssessment(risk_score=0.5, is_anomaly=False, model_used="none")


class FakeChatModel:
    def with_structured_output(self, schema: type) -> _FakeStructuredRunnable:
        return _FakeStructuredRunnable(schema)


class FakeLLMClient:
    """Drop-in replacement for app.llm.client.LLMClient used in tests."""

    @property
    def client(self) -> FakeChatModel:
        return FakeChatModel()


@pytest.fixture
def fake_llm_client() -> FakeLLMClient:
    return FakeLLMClient()


@pytest.fixture
def synthetic_claims_df() -> pd.DataFrame:
    from scripts.generate_synthetic_data import generate

    return generate(n_rows=200, seed=42)


@pytest.fixture
def low_risk_claim() -> ClaimInput:
    return ClaimInput(
        claim_id="C_LOW",
        policy_id="P00001",
        claim_amount=1200.0,
        claim_date=date(2026, 1, 15),
        incident_type="collision",
        days_since_policy_start=900,
        prior_claims_count=0,
    )


@pytest.fixture
def high_risk_claim() -> ClaimInput:
    return ClaimInput(
        claim_id="C_HIGH",
        policy_id="P00002",
        claim_amount=25000.0,
        claim_date=date(2026, 1, 15),
        incident_type="theft",
        days_since_policy_start=5,
        prior_claims_count=4,
    )


@pytest.fixture(autouse=True)
def test_db(tmp_path):
    from app.main import app

    engine = create_engine(f"sqlite:///{tmp_path}/test.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


@pytest.fixture(autouse=True)
def bypass_auth():
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: {"sub": "test-user", "email": "test@example.com", "app_metadata": {"role": "gestionnaire"}}
    yield
    app.dependency_overrides.pop(get_current_user, None)
