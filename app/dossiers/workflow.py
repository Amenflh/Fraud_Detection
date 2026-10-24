"""Claim lifecycle: ordered stages, their SLA targets and the allowed transitions."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Stage:
    key: str
    label: str
    owner: str
    sla_hours: float | None


STAGES: list[Stage] = [
    Stage("declare", "Déclaré", "assure", 1),
    Stage("analyse_ia", "Analyse IA", "gestionnaire", 24),
    Stage("expert_missionne", "Expertise", "expert", 72),
    Stage("validation_devis", "Validation devis", "expert", 48),
    Stage("en_reparation", "En réparation", "garage", 168),
    Stage("cloture", "Clôturé", "gestionnaire", None),
]
REJECTED = Stage("rejete", "Rejeté (fraude)", "gestionnaire", None)

STAGE_BY_KEY = {s.key: s for s in [*STAGES, REJECTED]}
TERMINAL = {"cloture", "rejete"}
ORDER = [s.key for s in STAGES]

ROLES = ["gestionnaire", "assure", "agent", "expert", "garage"]


def allowed_next(status: str) -> list[str]:
    if status in TERMINAL:
        return []
    i = ORDER.index(status)
    return [ORDER[i + 1], REJECTED.key]


def label(status: str) -> str:
    return STAGE_BY_KEY[status].label
