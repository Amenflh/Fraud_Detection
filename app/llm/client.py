import time
from functools import lru_cache

from app.config import get_settings

# After an API failure (exhausted quota, outage), skip the LLM for a while so every
# agent goes straight to its rule-based fallback instead of paying the error latency.
COOLDOWN_SECONDS = 300


class LLMNotConfiguredError(RuntimeError):
    pass


class LLMClient:
    def __init__(self) -> None:
        self._chat_model = None
        self._unavailable_until = 0.0

    def mark_unavailable(self) -> None:
        self._unavailable_until = time.monotonic() + COOLDOWN_SECONDS

    @property
    def client(self):
        if time.monotonic() < self._unavailable_until:
            raise LLMNotConfiguredError("LLM temporarily disabled after an API error; using rules.")
        if self._chat_model is None:
            settings = get_settings()
            if not settings.openai_api_key:
                raise LLMNotConfiguredError(
                    "OPENAI_API_KEY is not set. Add it to .env to enable LLM-powered agents."
                )
            from langchain_openai import ChatOpenAI

            self._chat_model = ChatOpenAI(
                model=settings.openai_model,
                api_key=settings.openai_api_key,
                # Fail fast (e.g. exhausted quota): agents fall back to rules instead of waiting.
                max_retries=1,
                timeout=30,
            )
        return self._chat_model


@lru_cache
def get_llm_client() -> LLMClient:
    return LLMClient()
