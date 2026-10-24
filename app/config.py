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


@lru_cache
def get_settings() -> Settings:
    return Settings()
