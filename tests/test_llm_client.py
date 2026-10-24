import pytest

from app.config import Settings
from app.llm.client import LLMClient, LLMNotConfiguredError


def test_llm_client_instantiation_does_not_raise():
    LLMClient()  # should never raise, even with no credentials


def test_llm_client_raises_only_on_access(monkeypatch):
    monkeypatch.setattr(
        "app.llm.client.get_settings", lambda: Settings(_env_file=None, openai_api_key=None)
    )
    client = LLMClient()
    with pytest.raises(LLMNotConfiguredError):
        _ = client.client


def test_mark_unavailable_short_circuits_to_rules(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = LLMClient()
    client.mark_unavailable()
    with pytest.raises(LLMNotConfiguredError):
        client.client
