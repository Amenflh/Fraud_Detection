from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import FraudVerdict

Role = Literal["gestionnaire", "assure", "agent", "expert", "garage"]


class InsuredInfo(BaseModel):
    name: str
    phone: str
    email: str | None = None
    cin: str | None = None


class VehicleInfo(BaseModel):
    plate: str
    make_model: str
    year: int | None = None


class DossierCreate(BaseModel):
    policy_id: str
    claim_amount: float = Field(gt=0)
    claim_date: date
    incident_type: str
    days_since_policy_start: int = Field(ge=0)
    prior_claims_count: int = Field(ge=0)
    vehicle_age: int | None = None
    claim_description: str | None = None
    insured: InsuredInfo
    vehicle: VehicleInfo
    city: str
    address: str | None = None
    garage_id: str | None = None
    channel: Literal["mobile", "agence", "papier"] = "mobile"


class ActorOut(BaseModel):
    id: str
    role: str
    name: str
    city: str
    specialties: list[str]
    phone: str | None
    rating: float


class EventOut(BaseModel):
    id: int
    at: datetime
    kind: str
    role: str
    label: str
    payload: dict


class MessageOut(BaseModel):
    id: int
    at: datetime
    role: str
    author: str
    text: str


class DocumentOut(BaseModel):
    id: int
    at: datetime
    role: str
    kind: str
    filename: str
    content_type: str
    analysis: dict


class DossierSummary(BaseModel):
    id: str
    status: str
    status_label: str
    created_at: datetime
    updated_at: datetime
    stage_entered_at: datetime
    sla_hours: float | None
    city: str
    insured_name: str
    plate: str
    make_model: str
    incident_type: str
    claim_amount: float
    quote_amount: float | None
    risk_score: float | None
    verdict: str | None
    expert_name: str | None
    garage_name: str | None
    network_level: str
    alerts: int
    fraud_index: int | None = None
    rules_level: str = "none"
    from_constat: str | None = None


class DossierDetail(DossierSummary):
    claim: dict
    insured: InsuredInfo
    vehicle: VehicleInfo
    address: str | None
    agent: ActorOut | None
    expert: ActorOut | None
    garage: ActorOut | None
    fraud: FraudVerdict | None
    ai: dict
    allowed_next: list[str]
    events: list[EventOut]
    messages: list[MessageOut]
    documents: list[DocumentOut]


class AdvanceRequest(BaseModel):
    status: str
    role: Role = "gestionnaire"
    note: str | None = None


class AssignExpertRequest(BaseModel):
    expert_id: str
    role: Role = "gestionnaire"


class MessageCreate(BaseModel):
    role: Role
    text: str = Field(min_length=1, max_length=2000)


class DossiersList(BaseModel):
    dossiers: list[DossierSummary]
    total: int
