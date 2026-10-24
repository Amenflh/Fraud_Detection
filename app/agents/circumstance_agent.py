"""Circumstance Agent: turns the driver's free-text / dictated account into the 17
standard boxes of the amicable accident report (constat amiable), for the declaring
driver (A) and as hints for the other driver (B), plus the damaged zones.

Uses the LLM when available; otherwise a clause-level parser that tells apart
"I did X" (driver A, first person) from "he/the other car did X" (driver B).
"""
import re
import unicodedata

from openai import OpenAIError
from pydantic import BaseModel

from app.llm.client import LLMClient, LLMNotConfiguredError

CASES: dict[int, str] = {
    1: "était en stationnement / à l'arrêt",
    2: "quittait un stationnement / ouvrait une portière",
    3: "prenait un stationnement",
    4: "sortait d'un parking, d'un lieu privé, d'un chemin de terre",
    5: "s'engageait dans un parking, un lieu privé, un chemin de terre",
    6: "s'engageait sur une place à sens giratoire",
    7: "roulait sur une place à sens giratoire",
    8: "heurtait à l'arrière, en roulant dans le même sens et sur la même file",
    9: "roulait dans le même sens et sur une file différente",
    10: "changeait de file",
    11: "doublait",
    12: "virait à droite",
    13: "virait à gauche",
    14: "reculait",
    15: "empiétait sur une voie réservée à la circulation en sens inverse",
    16: "venait de droite (dans un carrefour)",
    17: "n'avait pas observé un signal de priorité ou un feu rouge",
}

DAMAGE_ZONES = ["avant", "arriere", "gauche", "droite", "toit"]

# (case, regex patterns) matched on accent-free lowercase clauses; verbs use stems so
# every tense/person matches ("sortais", "sortait", "sortir").
_PATTERNS: list[tuple[int, list[str]]] = [
    (2, [r"quitt\w* (un|son|ma|sa|le) (stationnement|place)", r"ouvr\w* (la|sa|ma) portiere", r"sort\w* de (ma|sa) place"]),
    (3, [r"\bgar(er|ais|ait|ant)\b", r"pren\w* (un|une) (stationnement|place)", r"creneau"]),
    (4, [r"sort\w* (d'un|du|de) (parking|garage|lieu prive|chemin)", r"chemin de terre"]),
    (5, [r"(entr|engage)\w* (dans|sur) (un|le) (parking|lieu prive|chemin)"]),
    (6, [r"(entr|engage)\w* (dans|sur) (le|un) (rond|giratoire)", r"entree du (rond|giratoire)"]),
    (7, [r"(roul|circul|etai)\w* (dans|sur) (le|un) (rond|giratoire)"]),
    (8, [r"(percut|heurt|tamponn|touch|cogn)\w* (a |par |sur )?l'arriere", r"embout", r"par l'arriere", r"rentr\w* (dans|a) l'arriere"]),
    (9, [r"(file|voie) (differente|de gauche|de droite|d'a cote)"]),
    (10, [r"chang\w* de (file|voie)", r"rabatt", r"deboit"]),
    (11, [r"doubl(ais|ait|ant|er)\b", r"depass(ais|ait|ant|er)\b", r"en depassement"]),
    (12, [r"(tourn|vir)\w* a droite"]),
    (13, [r"(tourn|vir)\w* a gauche"]),
    (14, [r"recul", r"marche arriere"]),
    (15, [r"contresens", r"empiet", r"mord\w* sur", r"voie opposee"]),
    (16, [r"venai\w* de (ma |sa |la )?droite", r"venant de (ma |sa |la )?droite", r"arriv\w* (de|par) (ma |sa |la )?droite"]),
    (17, [r"(grill|brul)\w* (le |un )?(feu|stop)", r"pass\w* au rouge", r"(pas|sans) (respect|marqu|observ)\w* (le |la |un )?(feu|stop|priorite|cedez)", r"refus de priorite", r"forc\w* le passage"]),
]

# Case 1 needs an explicit subject: "j'étais à l'arrêt" (A) vs "la voiture stationnée" (B).
_STOPPED = r"(a l'arret|arrete\w*|stationne\w*|gare\w*|immobilise\w*)"
_SELF_STOPPED = re.compile(r"\b(j'etais|je suis|j'attendais|ma voiture etait|mon vehicule etait)\b[^,]*?" + _STOPPED)
_OTHER_STOPPED = re.compile(r"\b(voiture|vehicule|camion|taxi|moto|bus)\b\s+(\w+\s+)?" + _STOPPED)

_ZONE_KEYWORDS = {
    "avant": ["avant", "capot", "phare", "calandre"],
    "arriere": ["arriere", "coffre", "hayon"],
    "gauche": ["gauche", "portiere conducteur"],
    "droite": ["droite", "portiere passager"],
    "toit": ["toit"],
}

_FIRST_PERSON = re.compile(r"\b(je|nous)\b|\bj'|\b(ma voiture|mon vehicule)\b")
_CLAUSE_SPLIT = re.compile(r"[.;!?\n,]| quand | lorsque | alors que | puis | et | qui ")


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower().replace("’", "'"))
    return "".join(c for c in text if not unicodedata.combining(c))


class CaseExtraction(BaseModel):
    cases_a: list[int]
    cases_b_hint: list[int]
    damage_a: list[str]
    summary: str


def _rules(text: str) -> CaseExtraction:
    norm = _normalize(text)
    cases_a: set[int] = set()
    cases_b: set[int] = set()
    damage: set[str] = set()

    for clause in (c.strip() for c in _CLAUSE_SPLIT.split(norm)):
        if not clause:
            continue
        found = {case for case, patterns in _PATTERNS for p in patterns if re.search(p, clause)}
        if 6 in found:
            found.discard(7)
        # A narrates in the first person: a clause without "je/j'" ("le camion s'est
        # rabattu", "x m'a percuté") describes what the other driver did.
        is_self = bool(_FIRST_PERSON.search(clause.replace("m'a", "")))
        if _SELF_STOPPED.search(clause):
            cases_a.add(1)
        elif _OTHER_STOPPED.search(clause):
            cases_b.add(1)
        (cases_a if is_self else cases_b).update(found)
        if not is_self and 8 in found:
            damage.add("arriere")  # hit from behind by the other car

    # "venant de ma droite" is a direction, not a damaged side.
    zone_text = re.sub(r"\b(de|sur|a|par) (ma|sa|la) (droite|gauche)\b", " ", norm)
    for zone, kws in _ZONE_KEYWORDS.items():
        for kw in kws:
            own_part = rf"\b(ma|mon|mes)\b[a-z\- ]*\b{kw}|{kw}[a-z ]* de (ma|mon) (voiture|vehicule)|\bm'a [a-z' ]*{kw}"
            if re.search(own_part, zone_text):
                damage.add(zone)

    # An immobile car cannot also be the one that rear-ended, reversed, etc.
    if 1 in cases_a:
        cases_a -= {8, 10, 11, 14}
    labels = [CASES[c] for c in sorted(cases_a)]
    summary = (
        "Véhicule A : " + "; ".join(labels) if labels else "Aucune case identifiée automatiquement pour le véhicule A"
    ) + (f". Indices pour B : cases {', '.join(map(str, sorted(cases_b)))}." if cases_b else ".")
    return CaseExtraction(cases_a=sorted(cases_a), cases_b_hint=sorted(cases_b), damage_a=sorted(damage), summary=summary)


SYSTEM_PROMPT = (
    "Tu analyses la description d'un accident faite par le conducteur A (première personne). "
    "Renvoie les numéros des cases du constat amiable (1 à 17) cochées pour A, les cases probables "
    "pour l'autre conducteur B, et les zones endommagées du véhicule A parmi : "
    f"{', '.join(DAMAGE_ZONES)}. Cases : " + "; ".join(f"{k}={v}" for k, v in CASES.items())
)


def extract(text: str, llm_client: LLMClient | None = None) -> dict:
    if not text or not text.strip():
        empty = CaseExtraction(cases_a=[], cases_b_hint=[], damage_a=[], summary="")
        return {"agent": "circumstances", "source": "rules", **empty.model_dump()}
    if llm_client is None:
        from app.llm.client import get_llm_client

        llm_client = get_llm_client()
    try:
        result = llm_client.client.with_structured_output(CaseExtraction).invoke(
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": text}]
        )
        result.cases_a = sorted(c for c in set(result.cases_a) if c in CASES)
        result.cases_b_hint = sorted(c for c in set(result.cases_b_hint) if c in CASES)
        result.damage_a = sorted(z for z in set(result.damage_a) if z in DAMAGE_ZONES)
        source = "llm"
    except (LLMNotConfiguredError, OpenAIError) as exc:
        if isinstance(exc, OpenAIError):
            llm_client.mark_unavailable()
        result = _rules(text)
        source = "rules"
    return {"agent": "circumstances", "source": source, **result.model_dump()}
