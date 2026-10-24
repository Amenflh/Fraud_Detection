"""Network Agent: links claim files sharing people, vehicles or garages to expose fraud rings.

Besides the policyholder's own identifiers, third parties declared in a digital report
(other driver, witnesses) are indexed too: the same pedestrian/witness/other driver
showing up in several claims is a classic organised-fraud pattern.
"""
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Actor, Dossier

SUSPICIOUS = ("fraud", "needs_human_review")

# Identifiers that should belong to a single claimant/vehicle: sharing one across
# files is a strong signal. A garage is legitimately shared, so it only counts when
# several suspicious files converge on it.
PERSONAL_KEYS = {"phone": "téléphone", "email": "email", "cin": "CIN", "plate": "immatriculation"}


def _identifiers(d: Dossier) -> dict[str, str]:
    ids = {
        "phone": d.insured_json.get("phone"),
        "email": d.insured_json.get("email"),
        "cin": d.insured_json.get("cin"),
        "plate": d.vehicle_json.get("plate"),
    }
    return {k: str(v).strip().lower().replace(" ", "") for k, v in ids.items() if v}


def _norm(value) -> str:
    return str(value).strip().lower().replace(" ", "")


def _third_parties(d: Dossier) -> set[str]:
    """Phones/CINs of the other driver and witnesses recorded on the file's constat."""
    out = set()
    for tp in (d.ai_json or {}).get("constat", {}).get("third_parties", []):
        for key in ("phone", "cin"):
            if tp.get(key):
                out.add(_norm(tp[key]))
    return out


def _people(ids: dict[str, str]) -> set[str]:
    return {ids[k] for k in ("phone", "cin") if k in ids}


def _verdict(d: Dossier) -> str | None:
    return (d.verdict_json or {}).get("final_verdict")


def analyze(db: Session, dossier: Dossier, all_dossiers: list[Dossier] | None = None) -> dict:
    """`all_dossiers` lets callers scoring many files load the table once."""
    pool = all_dossiers if all_dossiers is not None else db.execute(select(Dossier)).scalars().all()
    others = [o for o in pool if o.id != dossier.id]
    mine = _identifiers(dossier)
    mine_tp = _third_parties(dossier)

    links = []
    for o in others:
        theirs = _identifiers(o)
        theirs_tp = _third_parties(o)
        shared = [PERSONAL_KEYS[k] for k, v in mine.items() if theirs.get(k) == v]
        if (mine_tp & (theirs_tp | _people(theirs))) or (_people(mine) & theirs_tp):
            shared.append("tiers")
        same_garage = dossier.garage_id and o.garage_id == dossier.garage_id
        if shared or (same_garage and _verdict(o) in SUSPICIOUS):
            links.append(
                {
                    "dossier_id": o.id,
                    "shared": shared + (["garage"] if same_garage else []),
                    "verdict": _verdict(o),
                    "status": o.status,
                }
            )

    personal_links = [l for l in links if any(s != "garage" for s in l["shared"])]
    suspicious_garage_links = [l for l in links if l["shared"] == ["garage"]]

    if (personal_links and any(l["verdict"] in SUSPICIOUS for l in personal_links)) or len(personal_links) >= 2:
        level = "high"
    elif personal_links or len(suspicious_garage_links) >= 2:
        level = "medium"
    else:
        level = "none"

    if level == "none":
        summary = "Aucun lien avec d'autres dossiers."
    else:
        parts = []
        if personal_links:
            parts.append(f"{len(personal_links)} dossier(s) partagent un identifiant personnel")
        if suspicious_garage_links:
            parts.append(f"{len(suspicious_garage_links)} dossier(s) suspect(s) chez le même garage")
        summary = " ; ".join(parts) + "."

    return {"agent": "network", "level": level, "links": links, "summary": summary}


def build_graph(db: Session) -> dict:
    """Bipartite graph (claim files <-> shared entities) restricted to entities shared by 2+ files."""
    dossiers = db.execute(select(Dossier)).scalars().all()
    garages = {a.id: a.name for a in db.execute(select(Actor).where(Actor.role == "garage")).scalars()}

    tiers_values = set().union(*(_third_parties(d) for d in dossiers)) if dossiers else set()
    entity_members: dict[tuple[str, str], list[Dossier]] = defaultdict(list)
    for d in dossiers:
        for key, value in _identifiers(d).items():
            # A policyholder who is also someone else's "third party" joins the tiers node.
            entity_members[("tiers" if key in ("phone", "cin") and value in tiers_values else key, value)].append(d)
        for value in _third_parties(d):
            if d not in entity_members[("tiers", value)]:
                entity_members[("tiers", value)].append(d)
        if d.garage_id:
            entity_members[("garage", d.garage_id)].append(d)

    nodes: dict[str, dict] = {}
    edges = []
    for (key, value), members in entity_members.items():
        if len(members) < 2:
            continue
        if key == "garage" and sum(_verdict(m) in SUSPICIOUS for m in members) < 2:
            continue
        entity_id = f"{key}:{value}"
        nodes[entity_id] = {
            "id": entity_id,
            "type": key,
            "label": garages.get(value, value) if key == "garage" else value,
        }
        for m in members:
            if key == "garage" and _verdict(m) not in SUSPICIOUS:
                continue
            nodes.setdefault(
                m.id,
                {
                    "id": m.id,
                    "type": "dossier",
                    "label": m.id,
                    "verdict": _verdict(m),
                    "risk": (m.verdict_json or {}).get("risk_assessment", {}).get("risk_score"),
                    "insured": m.insured_json.get("name"),
                },
            )
            edges.append({"source": m.id, "target": entity_id, "kind": key})

    return {"nodes": list(nodes.values()), "edges": edges}
