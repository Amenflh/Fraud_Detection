from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", protected_namespaces=()
    )

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"

    kaggle_username: str | None = None
    kaggle_key: str | None = None

    app_env: str = "development"
    log_level: str = "INFO"
    model_artifact_dir: Path = Path("data/models")
    fraud_score_threshold: float = 0.7
    cors_allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    database_url: str = "sqlite:///./data/local.db"
    supabase_jwt_secret: str | None = None
    supabase_url: str | None = None

    # SaaS fraud-check API (X-API-Key) and federation consortium (HMAC key shared by
    # member companies so identifiers are exchanged pseudonymised, never in clear).
    fraud_api_key: str = "demo-saas-key"
    consortium_key: str = "federation-demo-key"
    company_name: str = "Votre compagnie"

    # Role-based access. Accounts need app_metadata.role (set server-side only). STAFF_EMAILS
    # lets existing back-office accounts (created before roles existed) act as gestionnaire.
    staff_emails: str = ""

    # Where users open the web app (links in e-mails/SMS and in the PDF verification QR).
    public_app_url: str = "http://localhost:3000"

    # Notifications. Providers are auto-detected from credentials; without them messages are
    # recorded and marked "simulated" instead of being sent.
    notifications_enabled: bool = True
    notify_allowlist: str = ""  # comma list of e-mails/phones; empty = no restriction
    alert_emails: str = ""  # managers who receive the fraud alert e-mail
    fraud_alert_threshold: float = 50.0  # rules score (0-100) that triggers the alert

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "Sentinelle <no-reply@sentinelle.example>"
    smtp_ssl: bool = False  # True for implicit TLS (port 465); otherwise STARTTLS

    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from: str | None = None  # E.164 number, alphanumeric sender id, or MG... messaging service
    sms_default_country_code: str = "+216"

    @property
    def staff_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.staff_emails.split(",") if e.strip()]

    @property
    def alert_email_list(self) -> list[str]:
        return [e.strip() for e in self.alert_emails.split(",") if e.strip()]

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_host)

    @property
    def sms_configured(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_from)


@lru_cache
def get_settings() -> Settings:
    return Settings()
