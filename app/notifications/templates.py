"""Message content (French). Insured/partner messages never mention fraud: a suspicious file is
announced neutrally ("complément d'instruction") and the decision is communicated by a person."""
from html import escape

BRAND = "Sentinelle"

# status -> (headline, paragraph, short SMS sentence)
STATUS_MESSAGES: dict[str, tuple[str, str, str]] = {
    "analyse_ia": (
        "Votre déclaration est bien reçue",
        "Nous avons enregistré votre déclaration et son analyse a démarré. Un gestionnaire prend en charge votre dossier.",
        "declaration recue, analyse en cours",
    ),
    "expert_missionne": (
        "Un expert est missionné",
        "Un expert a été désigné pour évaluer les dommages{expert}. Il vous contactera pour fixer un rendez-vous.",
        "un expert est missionne{expert}",
    ),
    "validation_devis": (
        "Le devis de réparation est reçu",
        "Le garage a transmis son devis. Il est en cours de validation par l'expert.",
        "devis recu, validation en cours",
    ),
    "en_reparation": (
        "La réparation peut commencer",
        "Le devis est validé : votre véhicule peut être réparé{garage}.",
        "devis valide, reparation autorisee{garage}",
    ),
    "cloture": (
        "Votre dossier est clôturé",
        "Votre dossier est terminé. Merci de votre confiance.",
        "dossier cloture, merci de votre confiance",
    ),
    "rejete": (
        "Votre dossier nécessite un complément d'instruction",
        "Un gestionnaire va vous contacter dans les meilleurs délais au sujet de votre dossier.",
        "un gestionnaire va vous contacter au sujet de votre dossier",
    ),
}


def _wrap_html(headline: str, paragraphs: list[str], cta: tuple[str, str] | None = None) -> str:
    body = "".join(
        f'<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.55">{escape(p)}</p>' for p in paragraphs
    )
    button = (
        f'<p style="margin:22px 0 0"><a href="{escape(cta[1], quote=True)}" style="background:#0ea5e9;color:#fff;'
        f'text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px">{escape(cta[0])}</a></p>'
        if cta
        else ""
    )
    return (
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">'
        '<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;'
        'font-family:Segoe UI,Arial,sans-serif">'
        f'<tr><td style="background:#0f172a;padding:18px 28px;color:#67e8f9;font-weight:700;font-size:18px">{BRAND}</td></tr>'
        f'<tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">{escape(headline)}</h1>{body}{button}</td></tr>'
        '<tr><td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:12px">'
        "Message automatique : merci de ne pas répondre. Vos données sont traitées pour la gestion de votre sinistre.</td></tr>"
        "</table></td></tr></table>"
    )


def status_message(status: str, dossier_id: str, first_name: str, link: str, expert: str | None, garage: str | None) -> dict | None:
    if status not in STATUS_MESSAGES:
        return None
    headline, paragraph, sms_sentence = STATUS_MESSAGES[status]
    fmt = {"expert": f" : {expert}" if expert else "", "garage": f" chez {garage}" if garage else ""}
    paragraph, sms_sentence = paragraph.format(**fmt), sms_sentence.format(**fmt)
    paragraphs = [f"Bonjour {first_name},", paragraph, f"Référence de votre dossier : {dossier_id}."]
    return {
        "subject": f"[{BRAND}] Dossier {dossier_id} : {headline}",
        "text": "\n\n".join(paragraphs) + f"\n\nSuivre mon dossier : {link}",
        "html": _wrap_html(headline, paragraphs, ("Suivre mon dossier", link)),
        "sms": f"{BRAND}: {dossier_id} - {sms_sentence}. Suivi: {link}",
    }


def mission_message(dossier_id: str, name: str, city: str, incident: str, link: str) -> dict:
    paragraphs = [
        f"Bonjour {name},",
        f"Une nouvelle mission vous est confiée : dossier {dossier_id} ({incident}, {city}).",
        "Consultez le dossier, les photos et les documents sur la plateforme.",
    ]
    return {
        "subject": f"[{BRAND}] Nouvelle mission : dossier {dossier_id}",
        "text": "\n\n".join(paragraphs) + f"\n\nOuvrir le dossier : {link}",
        "html": _wrap_html("Nouvelle mission", paragraphs, ("Ouvrir le dossier", link)),
        "sms": f"{BRAND}: nouvelle mission {dossier_id} ({city}). Details: {link}",
    }


def fraud_alert_message(dossier_id: str, index: int, score: float, hits: list[dict], link: str) -> dict:
    lines = [f"- {h['id']} {h['title']} : {h['evidence']}" for h in hits[:6]]
    paragraphs = [
        f"Le dossier {dossier_id} dépasse le seuil d'alerte (score des règles {score:.0f}, indice de fraude {index}/100).",
        "Principales règles déclenchées :",
        *lines,
        "Recommandation : suspendre l'indemnisation et ouvrir une enquête.",
    ]
    return {
        "subject": f"[{BRAND}] ALERTE FRAUDE : dossier {dossier_id} (indice {index}/100)",
        "text": "\n".join(paragraphs) + f"\n\nOuvrir le dossier : {link}",
        "html": _wrap_html("Alerte fraude", paragraphs, ("Ouvrir le dossier", link)),
    }


def manual_message(dossier_id: str, first_name: str, text: str, link: str) -> dict:
    paragraphs = [f"Bonjour {first_name},", text, f"Référence de votre dossier : {dossier_id}."]
    return {
        "subject": f"[{BRAND}] Dossier {dossier_id} : message de votre gestionnaire",
        "text": "\n\n".join(paragraphs) + f"\n\nSuivre mon dossier : {link}",
        "html": _wrap_html("Message de votre gestionnaire", paragraphs, ("Suivre mon dossier", link)),
        "sms": text,
    }
