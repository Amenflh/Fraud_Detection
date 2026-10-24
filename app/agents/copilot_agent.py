"""Copilot Agent: summarizes a claim file, recommends the next action and drafts the
customer notification (SMS/email). Uses the LLM when available, rules otherwise."""
from openai import OpenAIError
from pydantic import BaseModel

from app.llm.client import LLMClient, LLMNotConfiguredError

SYSTEM_PROMPT = (
    "Tu es le copilote d'un gestionnaire sinistres automobile. À partir du dossier fourni "
    "(statut, verdict antifraude, analyses des agents), rédige en français : un résumé en 2 phrases, "
    "la prochaine action concrète recommandée au gestionnaire, et un SMS (160 caractères max, "
    "ton cordial, sans jargon ni mention de soupçon de fraude) informant l'assuré de l'avancement."
)


class CopilotNote(BaseModel):
    summary: str
    next_action: str
    sms: str
    priority: str = "normale"


def _rules(ctx: dict) -> CopilotNote:
    status, verdict = ctx["status"], ctx.get("verdict")
    network, quote, photos = ctx.get("network_level"), ctx.get("quote_level"), ctx.get("photo_alerts", 0)
    name = ctx["insured_name"].split()[0]

    if status == "analyse_ia":
        if verdict == "fraud" or network == "high" or photos or ctx.get("rules_level") == "high":
            action, priority = "Suspendre l'indemnisation et missionner un expert habilité fraude.", "haute"
        elif verdict == "needs_human_review":
            action, priority = "Vérifier les signaux d'alerte puis missionner l'expert recommandé.", "moyenne"
        else:
            action, priority = f"Missionner l'expert recommandé ({ctx.get('top_expert') or 'voir onglet Expert'}).", "normale"
    elif status == "expert_missionne":
        if ctx.get("rules_level") == "high":
            action, priority = "Transmettre à l'expert les règles de fraude déclenchées pour une contre-expertise ciblée.", "haute"
        else:
            action, priority = "Attendre le rapport d'expertise ; relancer l'expert si le SLA de 72 h est dépassé.", "normale"
    elif status == "validation_devis":
        if quote == "high":
            action, priority = "Contester le devis : écart important avec les dossiers comparables.", "haute"
        else:
            action, priority = "Valider le devis et lancer la réparation.", "normale"
    elif status == "en_reparation":
        action, priority = "Suivre la réparation et préparer le règlement au garage.", "normale"
    elif status == "rejete":
        action, priority = "Notifier le refus motivé et archiver les preuves.", "normale"
    else:
        action, priority = "Dossier clôturé : aucune action requise.", "basse"

    risk = f"score de risque {ctx['risk_score']:.2f}" if ctx.get("risk_score") is not None else "non scoré"
    amount = f"{ctx['claim_amount']:,.0f}".replace(",", " ")
    summary = (
        f"Sinistre {ctx['incident_type']} de {amount} DT déclaré par {ctx['insured_name']} "
        f"({ctx['city']}), {risk}. Étape actuelle : {ctx['status_label']}."
    )
    if ctx.get("top_rules"):
        summary += f" Indice de fraude {ctx.get('fraud_index')}/100 — principal signal : {ctx['top_rules'][0].split(' : ', 1)[-1]}."
    sms = f"Bonjour {name}, votre dossier {ctx['id']} est à l'étape « {ctx['status_label']} ». Suivi détaillé dans votre application."

    return CopilotNote(summary=summary, next_action=action, sms=sms[:160], priority=priority)


def run(ctx: dict, llm_client: LLMClient | None = None) -> dict:
    if llm_client is None:
        from app.llm.client import get_llm_client

        llm_client = get_llm_client()

    try:
        note = llm_client.client.with_structured_output(CopilotNote).invoke(
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": str(ctx)}]
        )
        source = "llm"
    except (LLMNotConfiguredError, OpenAIError) as exc:
        if isinstance(exc, OpenAIError):
            llm_client.mark_unavailable()
        note = _rules(ctx)
        source = "rules"

    return {"agent": "copilot", "source": source, **note.model_dump()}
