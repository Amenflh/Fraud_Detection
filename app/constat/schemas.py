from datetime import datetime

from pydantic import BaseModel, Field


class Party(BaseModel):
    name: str
    phone: str
    cin: str | None = None
    email: str | None = None
    address: str | None = None
    policy_id: str | None = None
    insurer: str | None = None
    plate: str
    make_model: str
    cases: list[int] = []
    damage: list[str] = []
    observations: str | None = None


class Witness(BaseModel):
    name: str
    phone: str | None = None
    cin: str | None = None


class ConstatCreate(BaseModel):
    accident_at: datetime
    lat: float | None = None
    lng: float | None = None
    address: str | None = None
    city: str
    party_a: Party
    transcript_a: str | None = None
    witnesses: list[Witness] = []


class Signature(BaseModel):
    image: str = Field(description="PNG data URL drawn on the signature pad")
    lat: float | None = None
    lng: float | None = None


class PartyBSubmit(BaseModel):
    party_b: Party
    signature: Signature


class ConvertRequest(BaseModel):
    claim_amount: float = Field(gt=0)
    garage_id: str | None = None


class ExtractRequest(BaseModel):
    text: str = Field(max_length=5000)


class ConstatFileOut(BaseModel):
    id: int
    party: str
    kind: str
    content_type: str
    analysis: dict
    at: datetime


class ConstatOut(BaseModel):
    id: str
    token: str
    status: str
    created_at: datetime
    accident_at: datetime
    lat: float | None
    lng: float | None
    address: str | None
    city: str
    party_a: dict
    party_b: dict | None
    witnesses: list
    transcript_a: str | None
    signed_a: bool
    signed_b: bool
    analysis: dict
    seal: str | None
    dossier_id: str | None
    files: list[ConstatFileOut]


class PublicConstat(BaseModel):
    """What driver B sees before signing: no contact details of driver A."""

    id: str
    status: str
    accident_at: datetime
    address: str | None
    city: str
    lat: float | None
    lng: float | None
    vehicle_a: dict
    cases_a: list[int]
    damage_a: list[str]
    signed_b: bool
