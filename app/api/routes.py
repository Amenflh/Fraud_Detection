from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.agents.graph import build_graph
from app.auth import get_current_user
from app.config import get_settings
from app.data.repository import NoDatasetError, get_repository
from app.db.engine import get_db
from app.db.repository import all_verdicts, get_verdict, list_verdicts, save_verdict
from app.ml.model import FraudModel, ModelNotTrainedError
from app.schemas import (
    AnalyzeClaimRequest,
    AnalyzeClaimResponse,
    ClaimsListResponse,
    ClaimsStats,
    FraudVerdict,
    ScoreBucket,
    StatsResponse,
)

router = APIRouter()


@lru_cache
def _get_graph():
    return build_graph()


def _compute_stats(verdicts: list[FraudVerdict]) -> ClaimsStats:
    total = len(verdicts)

    fraud_count = sum(1 for v in verdicts if v.final_verdict == "fraud")
    not_fraud_count = sum(1 for v in verdicts if v.final_verdict == "not_fraud")
    needs_review_count = sum(1 for v in verdicts if v.final_verdict == "needs_human_review")

    scores = [v.risk_assessment.risk_score for v in verdicts]
    avg_risk_score = sum(scores) / total if total else 0.0
    fraud_rate = fraud_count / total if total else 0.0

    buckets = []
    for i in range(10):
        lo, hi = i / 10, (i + 1) / 10
        is_last = i == 9
        count = sum(1 for s in scores if (lo <= s < hi) or (is_last and s == 1.0))
        buckets.append(ScoreBucket(range_label=f"{lo:.1f}-{hi:.1f}", count=count))

    return ClaimsStats(
        total_claims=total,
        fraud_count=fraud_count,
        not_fraud_count=not_fraud_count,
        needs_review_count=needs_review_count,
        fraud_rate=fraud_rate,
        avg_risk_score=avg_risk_score,
        score_distribution=buckets,
    )


@router.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@router.get("/health")
def health() -> dict:
    settings = get_settings()

    model_trained = True
    try:
        FraudModel.load(settings.model_artifact_dir)
    except ModelNotTrainedError:
        model_trained = False

    dataset_present = True
    try:
        get_repository()
    except NoDatasetError:
        dataset_present = False

    return {
        "status": "ok",
        "openai_configured": bool(settings.openai_api_key),
        "model_trained": model_trained,
        "dataset_present": dataset_present,
        "supabase_auth_configured": bool(settings.supabase_jwt_secret),
    }


@router.post("/claims/analyze", response_model=AnalyzeClaimResponse)
def analyze_claim(
    request: AnalyzeClaimRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> AnalyzeClaimResponse:
    graph = _get_graph()
    try:
        result = graph.invoke({"claim": request.claim, "errors": []})
    except Exception as exc:  # noqa: BLE001 - last-resort safety net; nodes handle their own errors
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    verdict = result["verdict"]
    save_verdict(db, request.claim, verdict)
    return AnalyzeClaimResponse(verdict=verdict)


@router.get("/claims/{claim_id}/report", response_model=AnalyzeClaimResponse)
def get_report(
    claim_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> AnalyzeClaimResponse:
    verdict = get_verdict(db, claim_id)
    if verdict is None:
        raise HTTPException(status_code=404, detail=f"No report found for claim_id={claim_id}")
    return AnalyzeClaimResponse(verdict=verdict)


@router.get("/claims", response_model=ClaimsListResponse)
def list_claims(
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
    user: dict = Depends(get_current_user),
) -> ClaimsListResponse:
    claims, total = list_verdicts(db, limit=limit, offset=offset)
    return ClaimsListResponse(claims=claims, total=total)


@router.get("/stats", response_model=StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> StatsResponse:
    stats = _compute_stats(all_verdicts(db))
    return StatsResponse(stats=stats)
