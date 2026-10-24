import jwt
import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.config import get_settings
from app.main import app


@pytest.fixture
def real_auth():
    """Temporarily disable the autouse bypass_auth override to exercise the real dependency."""
    app.dependency_overrides.pop(get_current_user, None)
    yield
    get_settings.cache_clear()


def _set_secret(monkeypatch, secret: str | None):
    if secret is None:
        # Empty (not unset) so a real .env file cannot supply the secret.
        monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    else:
        monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    get_settings.cache_clear()


def test_missing_secret_returns_503(real_auth, monkeypatch):
    _set_secret(monkeypatch, None)
    client = TestClient(app)
    response = client.get("/stats")
    assert response.status_code == 503


def test_missing_token_returns_401(real_auth, monkeypatch):
    _set_secret(monkeypatch, "test-secret")
    client = TestClient(app)
    response = client.get("/stats")
    assert response.status_code == 401


def test_token_signed_with_wrong_secret_returns_401(real_auth, monkeypatch):
    _set_secret(monkeypatch, "test-secret")
    bad_token = jwt.encode({"sub": "u1", "aud": "authenticated"}, "wrong-secret", algorithm="HS256")
    client = TestClient(app)
    response = client.get("/stats", headers={"Authorization": f"Bearer {bad_token}"})
    assert response.status_code == 401


def test_valid_token_returns_200(real_auth, monkeypatch):
    _set_secret(monkeypatch, "test-secret")
    token = jwt.encode({"sub": "u1", "aud": "authenticated"}, "test-secret", algorithm="HS256")
    client = TestClient(app)
    response = client.get("/stats", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
