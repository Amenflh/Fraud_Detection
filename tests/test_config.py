from app.config import Settings


def test_settings_load_without_env_vars():
    settings = Settings(_env_file=None)
    assert settings.openai_api_key is None
    assert settings.openai_model == "gpt-4o-mini"
    assert settings.fraud_score_threshold == 0.7
