"""Responsibility Agent: applies a simplified liability scale (barème) to the boxes
ticked by both drivers, and checks the report's internal consistency.

The scale is a simplified, explainable version of the inter-insurer conventions:
it decides the clear-cut cases and leaves the rest to the expert (50/50, flagged).
"""
from datetime import datetime, timedelta
from math import asin, cos, radians, sin, sqrt

from app.agents.circumstance_agent import CASES

MANOEUVRES = {2, 3, 4, 5}

# (cases that make a driver liable, explanation) — evaluated in order.
_LIABLE_IF_ALONE: list[tuple[set[int], str]] = [
    ({8}, "heurtait l'arrière d'un véhicule circulant dans la même file"),
    ({17}, "n'a pas respecté un signal de priorité ou un feu rouge"),
    ({14}, "effectuait une marche arrière"),
    ({15}, "empiétait sur la voie de circulation inverse"),
    (MANOEUVRES, "effectuait une manœuvre de stationnement / sortie de parking"),
    ({10, 11}, "changeait de file ou doublait"),
    ({6}, "s'engageait sur le giratoire sans laisser la priorité"),
    ({13}, "virait à gauche en coupant la trajectoire"),
]

EXPECTED_DAMAGE = {
    8: ("avant", "le véhicule qui heurte à l'arrière doit présenter un choc à l'avant"),
    14: ("arriere", "le véhicule qui recule doit présenter un choc à l'arrière"),
}


def _who(cases_a: set[int], cases_b: set[int], liable: set[int]) -> str | None:
    a, b = bool(cases_a & liable), bool(cases_b & liable)
    if a and not b:
        return "a"
    if b and not a:
        return "b"
    return None


def decide(cases_a: list[int], cases_b: list[int]) -> dict:
    a, b = set(cases_a), set(cases_b)

    if 1 in a and 1 not in b:
        return {"a": 0, "b": 100, "rule": "A était en stationnement / à l'arrêt : B entièrement responsable", "contradiction": False}
    if 1 in b and 1 not in a:
        return {"a": 100, "b": 0, "rule": "B était en stationnement / à l'arrêt : A entièrement responsable", "contradiction": False}

    for liable, why in _LIABLE_IF_ALONE:
        who = _who(a, b, liable)
        if who:
            return {
                "a": 100 if who == "a" else 0,
                "b": 0 if who == "a" else 100,
                "rule": f"Conducteur {who.upper()} {why}",
                "contradiction": False,
            }

    if (16 in a) != (16 in b):
        favoured = "a" if 16 in a else "b"
        other = "b" if favoured == "a" else "a"
        return {
            "a": 0 if favoured == "a" else 100,
            "b": 100 if favoured == "a" else 0,
            "rule": f"Priorité à droite : {favoured.upper()} venait de droite, {other.upper()} devait céder le passage",
            "contradiction": False,
        }

    contradiction = bool(a & b & {1, 8, 16, 17})
    return {
        "a": 50,
        "b": 50,
        "rule": "Cas non tranché par le barème : partage 50/50 à confirmer par l'expert"
        + (" (déclarations contradictoires)" if contradiction else ""),
        "contradiction": contradiction,
    }


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    h = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def _norm(v: str | None) -> str:
    return (v or "").lower().replace(" ", "")


def coherence(constat, created_at: datetime) -> list[dict]:
    """Consistency checks on a two-party report; each flag feeds the fraud rules engine."""
    flags: list[dict] = []
    a, b = constat.party_a, constat.party_b or {}
    cases_a, cases_b = set(a.get("cases", [])), set(b.get("cases", []))
    damage = {"a": set(a.get("damage", [])), "b": set(b.get("damage", []))}

    for case in {1, 8, 16, 17} & cases_a & cases_b:
        flags.append({"code": "K01", "level": "medium", "text": f"Les deux conducteurs cochent la case {case} ({CASES[case]})"})

    for party, cases in (("a", cases_a), ("b", cases_b)):
        for case, (zone, why) in EXPECTED_DAMAGE.items():
            if case in cases and damage[party] and zone not in damage[party]:
                flags.append({"code": "K02", "level": "high", "text": f"Zones de choc incohérentes ({party.upper()}) : {why}"})
        other = "b" if party == "a" else "a"
        if 8 in cases and damage[other] and "arriere" not in damage[other]:
            flags.append({"code": "K02", "level": "high", "text": f"Zones de choc incohérentes ({other.upper()}) : heurté à l'arrière sans dommage arrière déclaré"})

    if b:
        if _norm(a.get("phone")) and _norm(a.get("phone")) == _norm(b.get("phone")):
            flags.append({"code": "K03", "level": "high", "text": "Les deux conducteurs déclarent le même numéro de téléphone"})
        if _norm(a.get("address")) and _norm(a.get("address")) == _norm(b.get("address")):
            flags.append({"code": "K03", "level": "high", "text": "Les deux conducteurs déclarent la même adresse"})
        last_a, last_b = (a.get("name") or "").split()[-1:], (b.get("name") or "").split()[-1:]
        if last_a and last_a == last_b:
            flags.append({"code": "K03", "level": "medium", "text": f"Même nom de famille ({last_a[0]}) : lien familial possible"})

    for party, sig in (("a", constat.signature_a), ("b", constat.signature_b)):
        if sig and sig.get("lat") is not None and constat.lat is not None:
            km = _distance_km(constat.lat, constat.lng, sig["lat"], sig["lng"])
            if km > 5:
                flags.append({"code": "K04", "level": "medium", "text": f"Constat signé par {party.upper()} à {km:.0f} km du lieu de l'accident"})

    hour = constat.accident_at.hour
    if (hour >= 22 or hour < 5) and not constat.witnesses:
        flags.append({"code": "K05", "level": "low", "text": f"Accident de nuit ({hour} h) sans témoin"})

    if created_at - constat.accident_at > timedelta(days=5):
        flags.append({"code": "K06", "level": "medium", "text": f"Constat établi {(created_at - constat.accident_at).days} jours après l'accident"})

    return flags
