from datetime import UTC, date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class ClaimRecord(Base):
    __tablename__ = "claims"

    claim_id: Mapped[str] = mapped_column(String, primary_key=True)
    policy_id: Mapped[str] = mapped_column(String, index=True)
    final_verdict: Mapped[str] = mapped_column(String, index=True)
    risk_score: Mapped[float] = mapped_column(Float)
    verdict_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))


class Actor(Base):
    """A partner in the claim lifecycle: expert, garage or agent (insurance agency)."""

    __tablename__ = "actors"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    role: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    city: Mapped[str] = mapped_column(String)
    specialties: Mapped[list] = mapped_column(JSON, default=list)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    rating: Mapped[float] = mapped_column(Float, default=4.0)


class Dossier(Base):
    """A full claim file: declaration data, workflow status and assigned partners."""

    __tablename__ = "dossiers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    status: Mapped[str] = mapped_column(String, index=True)
    claim_json: Mapped[dict] = mapped_column(JSON)
    insured_json: Mapped[dict] = mapped_column(JSON)
    vehicle_json: Mapped[dict] = mapped_column(JSON)
    city: Mapped[str] = mapped_column(String, index=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("actors.id"), nullable=True)
    expert_id: Mapped[str | None] = mapped_column(ForeignKey("actors.id"), nullable=True)
    garage_id: Mapped[str | None] = mapped_column(ForeignKey("actors.id"), nullable=True)
    quote_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    verdict_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ai_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class DossierEvent(Base):
    """Timeline entry; `status_change` events also drive the per-stage KPIs."""

    __tablename__ = "dossier_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dossier_id: Mapped[str] = mapped_column(ForeignKey("dossiers.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    kind: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    label: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dossier_id: Mapped[str] = mapped_column(ForeignKey("dossiers.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    role: Mapped[str] = mapped_column(String)
    author: Mapped[str] = mapped_column(String)
    text: Mapped[str] = mapped_column(Text)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dossier_id: Mapped[str] = mapped_column(ForeignKey("dossiers.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    role: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)
    filename: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(String)
    content_type: Mapped[str] = mapped_column(String)
    image_hash: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)


class Contract(Base):
    """Insurance contract, used to identify a vehicle by policy number + plate."""

    __tablename__ = "contracts"

    policy_id: Mapped[str] = mapped_column(String, primary_key=True)
    plate: Mapped[str] = mapped_column(String, index=True)
    holder_name: Mapped[str] = mapped_column(String)
    phone: Mapped[str] = mapped_column(String)
    cin: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    make_model: Mapped[str] = mapped_column(String)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    city: Mapped[str] = mapped_column(String)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    insurer: Mapped[str] = mapped_column(String)


class SubscriptionPhoto(Base):
    """Reference photo of the vehicle taken at subscription, compared with claim photos."""

    __tablename__ = "subscription_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plate: Mapped[str] = mapped_column(String, index=True)
    kind: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(String)
    taken_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class Constat(Base):
    """Digital accident report (constat amiable) filled by both drivers."""

    __tablename__ = "constats"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    status: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    accident_at: Mapped[datetime] = mapped_column(DateTime)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str] = mapped_column(String)
    party_a: Mapped[dict] = mapped_column(JSON)
    party_b: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    witnesses: Mapped[list] = mapped_column(JSON, default=list)
    transcript_a: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature_a: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    signature_b: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    seal: Mapped[str | None] = mapped_column(String, nullable=True)
    dossier_id: Mapped[str | None] = mapped_column(ForeignKey("dossiers.id"), nullable=True)


class ConstatFile(Base):
    __tablename__ = "constat_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    constat_id: Mapped[str] = mapped_column(ForeignKey("constats.id"), index=True)
    party: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(String)
    content_type: Mapped[str] = mapped_column(String)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class RuleConfig(Base):
    """Per-insurer override of a fraud rule (enabled flag and weight)."""

    __tablename__ = "rule_configs"

    rule_id: Mapped[str] = mapped_column(String, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    weight: Mapped[float] = mapped_column(Float)


class ConsortiumEntry(Base):
    """Pseudonymised identifier reported as fraudulent by a member company (federation)."""

    __tablename__ = "consortium_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String)
    identifier_hash: Mapped[str] = mapped_column(String, index=True)
    company: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(String)
    reported_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
