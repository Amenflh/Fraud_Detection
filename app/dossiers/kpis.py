"""Workflow performance: time spent per stage vs SLA, per-partner metrics, trends."""
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Actor, Dossier, DossierEvent
from app.dossiers import workflow
from app.dossiers.service import utcnow

SUSPICIOUS = ("fraud", "needs_human_review")


def _hours(delta: timedelta) -> float:
    return delta.total_seconds() / 3600


def _stage_spans(db: Session, now: datetime) -> dict[str, list[dict]]:
    """Per dossier: [{stage, start, end, hours, open}] from status_change events."""
    rows = db.execute(
        select(DossierEvent.dossier_id, DossierEvent.at, DossierEvent.payload)
        .where(DossierEvent.kind == "status_change")
        .order_by(DossierEvent.dossier_id, DossierEvent.at, DossierEvent.id)
    ).all()
    transitions: dict[str, list[tuple[str, datetime]]] = defaultdict(list)
    for dossier_id, at, payload in rows:
        transitions[dossier_id].append((payload.get("to"), at))

    spans: dict[str, list[dict]] = {}
    for dossier_id, seq in transitions.items():
        out = []
        for i, (stage, start) in enumerate(seq):
            if stage in workflow.TERMINAL:
                continue
            end = seq[i + 1][1] if i + 1 < len(seq) else None
            out.append(
                {"stage": stage, "start": start, "end": end, "hours": _hours((end or now) - start), "open": end is None}
            )
        spans[dossier_id] = out
    return spans


def compute(db: Session, now: datetime | None = None) -> dict:
    now = now or utcnow()
    dossiers = db.execute(select(Dossier)).scalars().all()
    actors = {a.id: a for a in db.execute(select(Actor)).scalars()}
    spans = _stage_spans(db, now)
    by_id = {d.id: d for d in dossiers}

    stages = []
    overdue = []
    for stage in workflow.STAGES[:-1]:
        all_spans = [(dossier_id, s) for dossier_id, ss in spans.items() for s in ss if s["stage"] == stage.key]
        done = [s["hours"] for _, s in all_spans if not s["open"]]
        open_spans = [(dossier_id, s) for dossier_id, s in all_spans if s["open"]]
        within = [h for h in done if stage.sla_hours is None or h <= stage.sla_hours]
        for dossier_id, s in open_spans:
            if stage.sla_hours and s["hours"] > stage.sla_hours and by_id[dossier_id].status == stage.key:
                d = by_id[dossier_id]
                owner_id = {"expert": d.expert_id, "garage": d.garage_id}.get(stage.owner)
                overdue.append(
                    {
                        "dossier_id": dossier_id,
                        "stage": stage.key,
                        "stage_label": stage.label,
                        "hours": round(s["hours"], 1),
                        "sla_hours": stage.sla_hours,
                        "owner": actors[owner_id].name if owner_id in actors else "Gestionnaire",
                    }
                )
        stages.append(
            {
                "key": stage.key,
                "label": stage.label,
                "owner": stage.owner,
                "sla_hours": stage.sla_hours,
                "avg_hours": round(mean(done), 1) if done else None,
                "completed": len(done),
                "open": sum(1 for d in dossiers if d.status == stage.key),
                "sla_rate": round(len(within) / len(done), 3) if done else None,
            }
        )
    overdue.sort(key=lambda o: o["hours"] / o["sla_hours"], reverse=True)

    def partner_stats(role: str, stage_key: str) -> list[dict]:
        out = []
        sla = workflow.STAGE_BY_KEY[stage_key].sla_hours
        for actor in (a for a in actors.values() if a.role == role):
            mine = [d for d in dossiers if getattr(d, f"{role}_id") == actor.id]
            hours = [s["hours"] for d in mine for s in spans.get(d.id, []) if s["stage"] == stage_key and not s["open"]]
            quotes = [(d.ai_json or {}).get("quote") for d in mine if (d.ai_json or {}).get("quote")]
            out.append(
                {
                    "id": actor.id,
                    "name": actor.name,
                    "city": actor.city,
                    "rating": actor.rating,
                    "dossiers": len(mine),
                    "open": sum(1 for d in mine if d.status not in workflow.TERMINAL),
                    "avg_hours": round(mean(hours), 1) if hours else None,
                    "sla_rate": round(sum(h <= sla for h in hours) / len(hours), 3) if hours else None,
                    "suspicious": sum(1 for d in mine if (d.verdict_json or {}).get("final_verdict") in SUSPICIOUS),
                    "avg_quote_ratio": round(mean(q["ratio"] for q in quotes), 3) if quotes else None,
                    "flagged_quotes": sum(1 for q in quotes if q["level"] != "ok"),
                }
            )
        return sorted(out, key=lambda r: (r["avg_hours"] is None, r["avg_hours"] or 0))

    closed = [d for d in dossiers if d.status == "cloture"]
    cycle = [_hours(d.updated_at - d.created_at) for d in closed]
    rejected = [d for d in dossiers if d.status == "rejete"]
    savings = sum(
        (d.ai_json or {}).get("quote", {}).get("potential_saving", 0) for d in dossiers if (d.ai_json or {}).get("quote")
    )

    start = (now - timedelta(days=29)).date()
    trend = {start + timedelta(days=i): {"created": 0, "suspicious": 0, "closed": 0} for i in range(30)}
    for d in dossiers:
        day = d.created_at.date()
        if day in trend:
            trend[day]["created"] += 1
            trend[day]["suspicious"] += int((d.verdict_json or {}).get("final_verdict") in SUSPICIOUS)
        if d.status == "cloture" and d.updated_at.date() in trend:
            trend[d.updated_at.date()]["closed"] += 1

    return {
        "generated_at": now,
        "totals": {
            "dossiers": len(dossiers),
            "open": sum(1 for d in dossiers if d.status not in workflow.TERMINAL),
            "closed": len(closed),
            "rejected": len(rejected),
            "overdue": len(overdue),
            "avg_cycle_hours": round(mean(cycle), 1) if cycle else None,
            "blocked_amount": round(sum(d.claim_json["claim_amount"] for d in rejected), 2),
            "quote_savings": round(savings, 2),
            "fast_track_rate": round(
                sum(1 for d in dossiers if (d.verdict_json or {}).get("final_verdict") == "not_fraud") / len(dossiers), 3
            )
            if dossiers
            else 0,
        },
        "stages": stages,
        "overdue": overdue[:12],
        "experts": partner_stats("expert", "expert_missionne"),
        "garages": partner_stats("garage", "en_reparation"),
        "trend": [{"date": day.isoformat(), **v} for day, v in trend.items()],
    }
