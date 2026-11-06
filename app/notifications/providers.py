"""Delivery providers. Real ones are used only when credentials are configured; otherwise a
console provider records the message as "simulated" so the app works without any account."""
import logging
import re
import smtplib
import unicodedata
from email.message import EmailMessage
from email.utils import parseaddr

import httpx

from app.config import Settings

log = logging.getLogger("notifications")

# GSM 03.38 basic character set: a message using only these fits 160 chars per SMS segment;
# a single character outside it (e.g. "ê", "«") switches the whole SMS to UCS-2 (70 chars).
_GSM = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)


class DeliveryError(RuntimeError):
    """Provider rejected or could not deliver the message (the dispatcher may retry)."""


def gsm_safe(text: str) -> str:
    """Keeps an SMS in one segment: replaces/strips characters outside the GSM alphabet."""
    text = text.replace("«", '"').replace("»", '"').replace("’", "'").replace("…", "...").replace("–", "-")
    out = []
    for ch in text:
        if ch in _GSM:
            out.append(ch)
        else:
            base = unicodedata.normalize("NFKD", ch).encode("ascii", "ignore").decode()
            out.append(base or "?")
    return "".join(out)


def normalize_phone(raw: str, default_country_code: str = "+216") -> str:
    """Best-effort E.164: '22 418 903' -> '+21622418903', '00216...' -> '+216...'."""
    digits = re.sub(r"[^\d+]", "", raw.strip())
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if not digits.startswith("+"):
        digits = default_country_code + digits.lstrip("0")
    if not re.fullmatch(r"\+\d{8,15}", digits):
        raise DeliveryError(f"Numéro de téléphone invalide : {raw!r}")
    return digits


def send_email(settings: Settings, to: str, subject: str, text: str, html: str | None) -> str:
    """Sends via SMTP (any provider: Brevo, Mailgun, Gmail app password, Mailtrap...)."""
    if not settings.smtp_host:
        log.info("[email simulé] to=%s subject=%s", to, subject)
        return "console"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        if settings.smtp_ssl:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
        with server:
            if not settings.smtp_ssl:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password or "")
            server.send_message(msg, from_addr=parseaddr(settings.smtp_from)[1] or settings.smtp_from)
    except (smtplib.SMTPException, OSError) as exc:
        raise DeliveryError(f"SMTP : {exc}") from exc
    return "smtp"


def send_sms(settings: Settings, to: str, body: str) -> str:
    """Sends through Twilio's REST API (no SDK: one HTTPS call)."""
    if not settings.sms_configured:
        log.info("[sms simulé] to=%s body=%s", to, body)
        return "console"
    sender = settings.twilio_from
    data = {"To": normalize_phone(to, settings.sms_default_country_code), "Body": gsm_safe(body)}
    data["MessagingServiceSid" if sender.startswith("MG") else "From"] = sender
    try:
        resp = httpx.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json",
            data=data,
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise DeliveryError(f"Twilio : {exc}") from exc
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("message", resp.text)
        except ValueError:
            detail = resp.text
        raise DeliveryError(f"Twilio {resp.status_code} : {detail}")
    return "twilio"
