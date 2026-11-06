import secrets
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.dossier_graph import fraud_graph
from app.auth import require_manager, require_roles, require_staff
from app.config import get_settings
from app.db.engine import get_db
from app.db.models import Document, Dossier, SubscriptionPhoto
from app.dossiers.schemas import InsuredInfo, VehicleInfo
from app.fraud_rules import consortium, engine
from app.fraud_rules.rules import RULES_BY_ID
from app.schemas import ClaimInput

router = APIRouter(dependencies=[Depends(require_staff)])
saas_router = APIRouter(prefix="/api/v1", tags=["SaaS"])


class RuleUpdate(BaseModel):
    enabled: bool | None = None
    weight: float | None = Field(default=None, ge=0, le=50)


class BacktestRequest(BaseModel):
    overrides: dict[str, RuleUpdate] = {}


@router.get("/rules")
def list_rules(db: Session = Depends(get_db)) -> dict:
    rules = engine.catalog(db)
    return {"rules": rules, "total": len(rules), "enabled": sum(r["enabled"] for r in rules)}


@router.patch("/rules/{rule_id}", dependencies=[Depends(require_manager)])
def update_rule(rule_id: str, body: RuleUpdate, db: Session = Depends(get_db)) -> dict:
    if rule_id not in RULES_BY_ID:
        raise HTTPException(status_code=404, detail="Règle inconnue")
    engine.set_config(db, rule_id, body.enabled, body.weight)
    engine.recompute_all(db)
    return {"rule": next(r for r in engine.catalog(db) if r["id"] == rule_id)}


@router.post("/rules/backtest")
def backtest(body: BacktestRequest, db: Session = Depends(get_db)) -> dict:
    overrides = {rid: u.model_dump(exclude_none=True) for rid, u in body.overrides.items() if rid in RULES_BY_ID}
    return engine.backtest(db, overrides)


@router.get("/consortium")
def consortium_stats(db: Session = Depends(get_db)) -> dict:
    return consortium.stats(db)


@router.get("/documents/{document_id}/heatmap", dependencies=[Depends(require_roles("gestionnaire", "agent", "expert"))])
def document_heatmap(document_id: int, db: Session = Depends(get_db)) -> FileResponse:
    doc = db.get(Document, document_id)
    path = (doc.analysis.get("comparison") or {}).get("heatmap_path") if doc else None
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Pas de carte d'impact pour ce document")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/subscription-photos/{photo_id}/file", dependencies=[Depends(require_roles("gestionnaire", "agent", "expert"))])
def subscription_photo_file(photo_id: int, db: Session = Depends(get_db)) -> FileResponse:
    photo = db.get(SubscriptionPhoto, photo_id)
    if photo is None or not Path(photo.path).exists():
        raise HTTPException(status_code=404, detail="Photo introuvable")
    return FileResponse(photo.path, media_type="image/jpeg")


# --- SaaS: fraud check for an external insurer IS -------------------------------------


class FraudCheckRequest(BaseModel):
    reference: str = Field(description="Claim reference in the caller's system")
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
    third_parties: list[dict] = []


def _check_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not x_api_key or not secrets.compare_digest(x_api_key, get_settings().fraud_api_key):
        raise HTTPException(status_code=401, detail="Clé API invalide (en-tête X-API-Key)")


@saas_router.post("/fraud/check", dependencies=[Depends(_check_api_key)])
def fraud_check(body: FraudCheckRequest, db: Session = Depends(get_db)) -> dict:
    """Real-time check of a claim coming from another system. Nothing is persisted."""
    claim = ClaimInput(claim_id=body.reference, **body.model_dump(include=set(ClaimInput.model_fields) - {"claim_id"}))
    verdict = fraud_graph().invoke({"claim": claim, "errors": []})["verdict"]
    transient = Dossier(
        id=f"API-{body.reference}",
        status="analyse_ia",
        claim_json=claim.model_dump(mode="json"),
        insured_json=body.insured.model_dump(),
        vehicle_json=body.vehicle.model_dump(),
        city=body.city,
        garage_id=None,
        verdict_json=verdict.model_dump(mode="json"),
        ai_json={"constat": {"third_parties": body.third_parties}} if body.third_parties else {},
        created_at=engine._now(),
    )
    result = engine.evaluate_dossier(db, transient)
    return {
        "reference": body.reference,
        "fraud_index": result["fraud_index"],
        "level": result["level"],
        "ml": {"risk_score": verdict.risk_assessment.risk_score, "verdict": verdict.final_verdict},
        "rules": {"score": result["score"], "evaluated": result["evaluated"], "hits": result["hits"]},
        "consortium_hits": result["consortium"],
        "recommendation": {
            "high": "Bloquer le règlement et ouvrir une enquête",
            "medium": "Contrôle renforcé par un gestionnaire",
            "low": "Traitement standard avec vigilance",
            "none": "Traitement accéléré possible",
        }[result["level"]],
    }
