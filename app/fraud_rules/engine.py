"""Fraud rules engine: builds the context of a claim file, evaluates the configured rules
and combines the rules score with the ML risk into a single fraud index."""
from datetime import datetime
from statistics import median

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import network_agent
from app.db.models import Actor, Contract, Document, Dossier, Message, RuleConfig
from app.fraud_rules import consortium
from app.fraud_rules.rules import CATEGORIES, RULES, RULES_BY_ID, RuleContext

SUSPICIOUS = ("fraud", "needs_human_review")
SIMILARITY_THRESHOLD = 0.8


def _now() -> datetime:
    from app.dossiers.service import utcnow

    return utcnow()


def load_config(db: Session) -> dict[str, dict]:
    overrides = {c.rule_id: c for c in db.execute(select(RuleConfig)).scalars()}
    return {
        r.id: {
            "enabled": overrides[r.id].enabled if r.id in overrides else True,
            "weight": overrides[r.id].weight if r.id in overrides else r.weight,
        }
        for r in RULES
    }


def _story(d: Dossier) -> str:
    return " ".join(filter(None, [d.claim_json.get("claim_description"), (d.ai_json or {}).get("constat", {}).get("transcript")]))


def similar_stories(dossier: Dossier, candidates: list[Dossier]) -> list[dict]:
    """Near-identical accounts among linked files (same person, vehicle, third party...)."""
    mine = _story(dossier)
    pool = [c for c in candidates if _story(c)]
    if len(mine) < 15 or not pool:
        return []
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5)).fit([mine] + [_story(c) for c in pool])
    sims = cosine_similarity(vec.transform([mine]), vec.transform([_story(c) for c in pool]))[0]
    out = [{"dossier_id": c.id, "similarity": round(float(s), 3)} for c, s in zip(pool, sims) if s >= SIMILARITY_THRESHOLD]
    return sorted(out, key=lambda x: -x["similarity"])


def build_context(db: Session, d: Dossier, pool: list[Dossier] | None = None, now: datetime | None = None) -> RuleContext:
    pool = pool if pool is not None else db.execute(select(Dossier)).scalars().all()
    network = network_agent.analyze(db, d, pool)
    linked_ids = {l["dossier_id"] for l in network["links"] if any(s != "garage" for s in l["shared"])}
    same_name = {o.id for o in pool if o.id != d.id and o.insured_json.get("name", "").lower() == d.insured_json.get("name", "").lower()}
    candidates = [o for o in pool if o.id in linked_ids | same_name]

    same_type = [o.claim_json["claim_amount"] for o in pool if o.id != d.id and o.claim_json["incident_type"] == d.claim_json["incident_type"]]
    garage_suspicious = (
        sum(1 for o in pool if o.id != d.id and o.garage_id == d.garage_id and (o.verdict_json or {}).get("final_verdict") in SUSPICIOUS)
        if d.garage_id
        else 0
    )
    in_db = d in db
    return RuleContext(
        dossier=d,
        contract=db.get(Contract, d.claim_json["policy_id"]),
        garage=db.get(Actor, d.garage_id) if d.garage_id else None,
        documents=list(db.execute(select(Document).where(Document.dossier_id == d.id)).scalars()) if in_db else [],
        network=network,
        consortium=consortium.lookup(db, consortium.identifiers_of(d)),
        similar=similar_stories(d, candidates),
        messages=list(db.execute(select(Message.text).where(Message.dossier_id == d.id, Message.role == "assure")).scalars()) if in_db else [],
        garage_suspicious=garage_suspicious,
        type_median_amount=median(same_type) if len(same_type) >= 5 else None,
        contracts_known=db.scalar(select(Contract.policy_id).limit(1)) is not None,
        extra={"now": now or _now()},
    )


def level_for(score: float) -> str:
    return "high" if score >= 50 else "medium" if score >= 25 else "low" if score > 0 else "none"


def evaluate(ctx: RuleContext, config: dict[str, dict]) -> dict:
    hits = []
    for rule in RULES:
        cfg = config[rule.id]
        if not cfg["enabled"]:
            continue
        evidence = rule.check(ctx)
        if evidence:
            hits.append(
                {
                    "id": rule.id,
                    "category": rule.category,
                    "category_label": CATEGORIES[rule.category],
                    "title": rule.title,
                    "weight": cfg["weight"],
                    "evidence": evidence,
                }
            )
    hits.sort(key=lambda h: -h["weight"])
    score = min(100.0, sum(h["weight"] for h in hits))
    ml = ctx.risk or 0.0
    # Probabilistic OR: either signal alone can raise the index, both reinforce each other.
    index = round(100 * (1 - (1 - ml) * (1 - score / 100)))
    return {
        "score": round(score, 1),
        "level": level_for(score),
        "fraud_index": index,
        "ml_score": ml,
        "hits": hits,
        "evaluated": sum(1 for c in config.values() if c["enabled"]),
        "consortium": ctx.consortium,
        "similar": ctx.similar,
    }


def evaluate_dossier(db: Session, d: Dossier, pool: list[Dossier] | None = None) -> dict:
    return evaluate(build_context(db, d, pool), load_config(db))


def recompute_all(db: Session) -> int:
    pool = db.execute(select(Dossier)).scalars().all()
    config = load_config(db)
    for d in pool:
        d.ai_json = {**(d.ai_json or {}), "rules": evaluate(build_context(db, d, pool), config)}
    db.commit()
    return len(pool)


def backtest(db: Session, overrides: dict[str, dict]) -> dict:
    """Evaluates every file with the current config and with `overrides`, without saving."""
    pool = db.execute(select(Dossier)).scalars().all()
    current = load_config(db)
    proposed = {rid: {**cfg, **overrides.get(rid, {})} for rid, cfg in current.items()}
    contexts = [build_context(db, d, pool) for d in pool]

    def run(config):
        results = [evaluate(ctx, config) for ctx in contexts]
        per_rule: dict[str, int] = {r.id: 0 for r in RULES}
        for res in results:
            for h in res["hits"]:
                per_rule[h["id"]] += 1
        levels = {lvl: sum(1 for r in results if r["level"] == lvl) for lvl in ("high", "medium", "low", "none")}
        flagged = sorted((r["fraud_index"], ctx.dossier.id) for r, ctx in zip(results, contexts) if r["level"] == "high")
        return {"per_rule": per_rule, "levels": levels, "flagged": [i for _, i in reversed(flagged)]}

    before, after = run(current), run(proposed)
    return {
        "dossiers": len(pool),
        "before": before,
        "after": after,
        "newly_flagged": sorted(set(after["flagged"]) - set(before["flagged"])),
        "no_longer_flagged": sorted(set(before["flagged"]) - set(after["flagged"])),
    }


def catalog(db: Session) -> list[dict]:
    config = load_config(db)
    hits: dict[str, int] = {r.id: 0 for r in RULES}
    total = 0
    for ai in db.execute(select(Dossier.ai_json)).scalars():
        total += 1
        for h in (ai or {}).get("rules", {}).get("hits", []):
            hits[h["id"]] = hits.get(h["id"], 0) + 1
    return [
        {
            "id": r.id,
            "category": r.category,
            "category_label": CATEGORIES[r.category],
            "title": r.title,
            "default_weight": r.weight,
            "weight": config[r.id]["weight"],
            "enabled": config[r.id]["enabled"],
            "hits": hits.get(r.id, 0),
            "hit_rate": round(hits.get(r.id, 0) / total, 3) if total else 0,
        }
        for r in RULES
    ]


def set_config(db: Session, rule_id: str, enabled: bool | None, weight: float | None) -> None:
    rule = RULES_BY_ID[rule_id]
    cfg = db.get(RuleConfig, rule_id) or RuleConfig(rule_id=rule_id, enabled=True, weight=rule.weight)
    if enabled is not None:
        cfg.enabled = enabled
    if weight is not None:
        cfg.weight = max(0.0, min(50.0, weight))
    db.merge(cfg)
    db.commit()
