"""Catalogue of explainable fraud rules.

Each rule inspects a `RuleContext` (everything known about a claim file) and returns
the evidence string when it fires, or None. Weights are defaults: an insurer can
disable a rule or change its weight (RuleConfig) and back-test the impact first.
"""
import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime
from math import asin, cos, radians, sin, sqrt

from app.db.models import Actor, Contract, Document, Dossier

CATEGORIES = {
    "contrat": "Contrat",
    "sinistre": "Sinistre",
    "photo": "Photos & IA visuelle",
    "devis": "Devis & garage",
    "reseau": "Réseau & transversal",
    "constat": "Constat",
    "comportement": "Comportement",
}


@dataclass
class RuleContext:
    dossier: Dossier
    contract: Contract | None
    garage: Actor | None
    documents: list[Document]
    network: dict
    consortium: list[dict]
    similar: list[dict]
    messages: list[str]
    garage_suspicious: int
    type_median_amount: float | None
    contracts_known: bool
    extra: dict = field(default_factory=dict)

    @property
    def claim(self) -> dict:
        return self.dossier.claim_json

    @property
    def verdict(self) -> dict:
        return self.dossier.verdict_json or {}

    @property
    def ai(self) -> dict:
        return self.dossier.ai_json or {}

    @property
    def constat(self) -> dict | None:
        return self.ai.get("constat")

    @property
    def claim_date(self) -> date:
        return date.fromisoformat(self.claim["claim_date"])

    @property
    def risk(self) -> float | None:
        return self.verdict.get("risk_assessment", {}).get("risk_score")

    def images(self) -> list[Document]:
        return [d for d in self.documents if d.content_type.startswith("image/")]

    def photo_flags(self, needle: str) -> list[str]:
        return [f["text"] for d in self.images() for f in d.analysis.get("flags", []) if needle in f["text"]]

    def shared(self, label: str) -> list[str]:
        return [l["dossier_id"] for l in self.network.get("links", []) if label in l["shared"]]


@dataclass(frozen=True)
class Rule:
    id: str
    category: str
    title: str
    weight: float
    check: Callable[[RuleContext], str | None]


def _norm(text: str | None) -> str:
    text = unicodedata.normalize("NFKD", (text or "").lower())
    return "".join(c for c in text if not unicodedata.combining(c) and (c.isalnum() or c == " ")).strip()


def _km(a: dict, lat: float, lng: float) -> float:
    dlat, dlng = radians(lat - a["lat"]), radians(lng - a["lng"])
    h = sin(dlat / 2) ** 2 + cos(radians(a["lat"])) * cos(radians(lat)) * sin(dlng / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def _ids(ids: list[str]) -> str:
    return ", ".join(sorted(set(ids))[:3]) + ("…" if len(set(ids)) > 3 else "")


def _amount(v: float) -> str:
    return f"{v:,.0f} DT".replace(",", " ")


# --- Contrat ---------------------------------------------------------------------------


def c01(c):
    d = c.claim["days_since_policy_start"]
    return f"Sinistre {d} jours après la souscription" if d < 30 else None


def c02(c):
    d = c.claim["days_since_policy_start"]
    return f"Sinistre {d} jours après la souscription" if 30 <= d < 90 else None


def c03(c):
    if c.contract and c.claim_date > c.contract.end_date:
        return f"Contrat échu le {c.contract.end_date:%d/%m/%Y}, sinistre le {c.claim_date:%d/%m/%Y}"
    return None


def c04(c):
    if c.contract and _norm(c.contract.plate).replace(" ", "") != _norm(c.dossier.vehicle_json["plate"]).replace(" ", ""):
        return f"Véhicule déclaré {c.dossier.vehicle_json['plate']} ≠ véhicule assuré {c.contract.plate}"
    return None


def c05(c):
    return f"Aucun contrat {c.claim['policy_id']} dans le référentiel" if c.contracts_known and not c.contract else None


def c06(c):
    if c.contract and _norm(c.contract.holder_name) != _norm(c.dossier.insured_json["name"]):
        return f"Déclarant « {c.dossier.insured_json['name']} », titulaire « {c.contract.holder_name} »"
    return None


def c07(c):
    if c.contract and 0 <= (c.contract.end_date - c.claim_date).days <= 30:
        return f"Sinistre {(c.contract.end_date - c.claim_date).days} jours avant l'échéance du contrat"
    return None


# --- Sinistre --------------------------------------------------------------------------


def s01(c):
    a = c.claim["claim_amount"]
    return f"Montant déclaré {_amount(a)}" if a >= 15000 else None


def s02(c):
    m = c.type_median_amount
    a = c.claim["claim_amount"]
    return f"{_amount(a)} soit {a / m:.1f}× la médiane ({_amount(m)})" if m and a >= 3 * m else None


def s03(c):
    days = (c.dossier.created_at.date() - c.claim_date).days
    return f"Déclaré {days} jours après l'accident" if days > 5 else None


def s04(c):
    n = c.claim["prior_claims_count"]
    return f"{n} sinistres antérieurs" if 2 <= n < 4 else None


def s05(c):
    n = c.claim["prior_claims_count"]
    return f"{n} sinistres antérieurs" if n >= 4 else None


def s06(c):
    return {"theft": "Vol déclaré", "fire": "Incendie déclaré"}.get(c.claim["incident_type"])


def s07(c):
    age, a = c.claim.get("vehicle_age"), c.claim["claim_amount"]
    return f"Véhicule de {age} ans, montant {_amount(a)}" if age and age > 12 and a > 8000 else None


def s08(c):
    text = (c.claim.get("claim_description") or "") + " " + (c.constat or {}).get("transcript", "")
    return "Circonstances non décrites ou en moins de 20 caractères" if len(text.strip()) < 20 else None


def s09(c):
    return f"Score ML {c.risk:.2f}" if c.risk is not None and c.risk >= 0.7 else None


def s10(c):
    return f"Score ML {c.risk:.2f}" if c.risk is not None and 0.42 <= c.risk < 0.7 else None


def s11(c):
    return "Profil atypique détecté par IsolationForest" if c.verdict.get("risk_assessment", {}).get("is_anomaly") else None


# --- Photos ----------------------------------------------------------------------------


def p01(c):
    hits = c.photo_flags("déjà soumise")
    return hits[0] if hits else None


def p02(c):
    hits = c.photo_flags("avant la date")
    return hits[0] if hits else None


def p03(c):
    hits = c.photo_flags("retouche")
    return hits[0] if hits else None


def p04(c):
    age_hours = (c.extra["now"] - c.dossier.created_at).total_seconds() / 3600
    return "Aucune photo des dommages après 24 h" if not c.images() and age_hours > 24 else None


def p05(c):
    hits = c.photo_flags("Couleur de carrosserie")
    return hits[0] if hits else None


def p06(c):
    hits = c.photo_flags("Aucun choc visible")
    return f"{len(hits)} photo(s) sans choc visible vs souscription" if hits else None


def p07(c):
    loc = (c.constat or {}).get("location")
    if not loc or loc.get("lat") is None:
        return None
    for d in c.images():
        gps = d.analysis.get("gps")
        if gps:
            km = _km(loc, gps["lat"], gps["lng"])
            if km > 5:
                return f"Photo géolocalisée à {km:.0f} km du lieu de l'accident"
    return None


# --- Devis & garage --------------------------------------------------------------------


def g01(c):
    q = c.ai.get("quote")
    return f"Devis {q['ratio']:.0%} du montant attendu ({_amount(q['reference'])})" if q and q["ratio"] >= 1.5 else None


def g02(c):
    q = c.ai.get("quote")
    return f"Devis {q['ratio']:.0%} du montant attendu" if q and 1.25 <= q["ratio"] < 1.5 else None


def g03(c):
    return f"Garage lié à {c.garage_suspicious} autres dossiers suspects" if c.garage_suspicious >= 2 else None


def g04(c):
    if c.garage and c.garage.city != c.dossier.city:
        return f"Garage à {c.garage.city}, sinistre à {c.dossier.city}"
    return None


# --- Réseau & transversal ---------------------------------------------------------------


def r01(c):
    ids = c.shared("téléphone")
    return f"Téléphone commun avec {_ids(ids)}" if ids else None


def r02(c):
    ids = c.shared("CIN")
    return f"CIN commune avec {_ids(ids)}" if ids else None


def r03(c):
    ids = c.shared("email")
    return f"Email commun avec {_ids(ids)}" if ids else None


def r04(c):
    ids = c.shared("immatriculation")
    return f"Même véhicule dans {_ids(ids)}" if ids else None


def r05(c):
    ids = c.shared("tiers")
    return f"Tiers / témoin déjà impliqué dans {_ids(ids)}" if ids else None


def r06(c):
    if c.similar:
        top = c.similar[0]
        return f"Récit similaire à {top['similarity']:.0%} avec {top['dossier_id']}"
    return None


def r07(c):
    if c.consortium:
        h = c.consortium[0]
        return f"{h['kind_label'].capitalize()} signalé(e) par {h['company']} ({h['reason']})"
    return None


# --- Constat ---------------------------------------------------------------------------


def _constat_flag(code: str):
    def check(c):
        flags = [f["text"] for f in (c.constat or {}).get("coherence", []) if f["code"] == code]
        return flags[0] if flags else None

    return check


def k07(c):
    k = c.constat
    return "Le second conducteur n'a pas signé le constat" if k and not k.get("signed_b") else None


# --- Comportement ----------------------------------------------------------------------

_URGENCY = re.compile(r"\b(urgent|rapidement|au plus vite|vite|immediatement|etranger|tout de suite)\b")
_PAYMENT = re.compile(r"\b(especes|en liquide|cash|au nom de|compte de (mon|ma)|virement a un)\b")


def b01(c):
    for m in c.messages:
        found = _URGENCY.search(_norm(m))
        if found:
            return f"Message de l'assuré : « {m[:70]} »"
    return None


def b02(c):
    for m in c.messages + [c.claim.get("claim_description") or ""]:
        if _PAYMENT.search(_norm(m)):
            return f"« {m[:70]} »"
    return None


RULES: list[Rule] = [
    Rule("C01", "contrat", "Sinistre moins de 30 jours après la souscription", 15, c01),
    Rule("C02", "contrat", "Sinistre entre 30 et 90 jours après la souscription", 6, c02),
    Rule("C03", "contrat", "Sinistre survenu après l'échéance du contrat", 30, c03),
    Rule("C04", "contrat", "Véhicule déclaré différent du véhicule assuré", 20, c04),
    Rule("C05", "contrat", "Contrat introuvable dans le référentiel", 8, c05),
    Rule("C06", "contrat", "Déclarant différent du titulaire du contrat", 8, c06),
    Rule("C07", "contrat", "Sinistre dans les 30 jours précédant l'échéance", 4, c07),
    Rule("S01", "sinistre", "Montant déclaré élevé (≥ 15 000 DT)", 6, s01),
    Rule("S02", "sinistre", "Montant ≥ 3× la médiane des sinistres du même type", 10, s02),
    Rule("S03", "sinistre", "Déclaration tardive (> 5 jours après l'accident)", 8, s03),
    Rule("S04", "sinistre", "Antécédents : 2 à 3 sinistres sur la police", 8, s04),
    Rule("S05", "sinistre", "Multi-sinistré : 4 sinistres antérieurs ou plus", 15, s05),
    Rule("S06", "sinistre", "Scénario à risque (vol ou incendie)", 4, s06),
    Rule("S07", "sinistre", "Véhicule ancien (> 12 ans) avec montant élevé", 7, s07),
    Rule("S08", "sinistre", "Circonstances absentes ou trop sommaires", 3, s08),
    Rule("S09", "sinistre", "Score du modèle ML élevé (≥ 0,70)", 15, s09),
    Rule("S10", "sinistre", "Score du modèle ML intermédiaire (0,42 – 0,70)", 6, s10),
    Rule("S11", "sinistre", "Anomalie statistique (IsolationForest)", 5, s11),
    Rule("P01", "photo", "Photo déjà utilisée dans un autre dossier", 30, p01),
    Rule("P02", "photo", "Photo prise avant la date de l'accident (EXIF)", 25, p02),
    Rule("P03", "photo", "Retouche logicielle détectée", 12, p03),
    Rule("P04", "photo", "Aucune photo des dommages", 4, p04),
    Rule("P05", "photo", "Véhicule photographié différent de la souscription", 20, p05),
    Rule("P06", "photo", "Aucun choc visible par rapport à la souscription", 18, p06),
    Rule("P07", "photo", "Photo géolocalisée loin du lieu de l'accident", 15, p07),
    Rule("G01", "devis", "Devis ≥ 150 % du montant attendu", 15, g01),
    Rule("G02", "devis", "Devis entre 125 et 150 % du montant attendu", 6, g02),
    Rule("G03", "devis", "Garage concentrant plusieurs dossiers suspects", 10, g03),
    Rule("G04", "devis", "Garage éloigné du lieu du sinistre", 3, g04),
    Rule("R01", "reseau", "Téléphone partagé avec un autre dossier", 20, r01),
    Rule("R02", "reseau", "CIN partagée avec un autre dossier", 25, r02),
    Rule("R03", "reseau", "Email partagé avec un autre dossier", 12, r03),
    Rule("R04", "reseau", "Véhicule impliqué dans un autre sinistre", 10, r04),
    Rule("R05", "reseau", "Tiers ou témoin présent dans plusieurs sinistres", 25, r05),
    Rule("R06", "reseau", "Circonstances quasi identiques à un sinistre lié", 18, r06),
    Rule("R07", "reseau", "Identifiant signalé par une autre compagnie (base mutualisée)", 30, r07),
    Rule("K01", "constat", "Déclarations contradictoires entre conducteurs", 10, _constat_flag("K01")),
    Rule("K02", "constat", "Zones de choc incohérentes avec les circonstances", 15, _constat_flag("K02")),
    Rule("K03", "constat", "Lien suspect entre les deux conducteurs (complaisance)", 25, _constat_flag("K03")),
    Rule("K04", "constat", "Constat signé loin du lieu de l'accident", 8, _constat_flag("K04")),
    Rule("K05", "constat", "Accident de nuit sans témoin", 5, _constat_flag("K05")),
    Rule("K06", "constat", "Constat établi tardivement", 6, _constat_flag("K06")),
    Rule("K07", "constat", "Constat non signé par le second conducteur", 6, k07),
    Rule("B01", "comportement", "Pression sur les délais (urgence, départ à l'étranger…)", 5, b01),
    Rule("B02", "comportement", "Demande de règlement inhabituelle (espèces, tiers bénéficiaire)", 10, b02),
]

RULES_BY_ID = {r.id: r for r in RULES}
