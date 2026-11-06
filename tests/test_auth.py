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


def _token(secret="test-secret", **claims):
    return jwt.encode({"sub": "u1", "aud": "authenticated", **claims}, secret, algorithm="HS256")


def test_valid_token_without_role_is_denied(real_auth, monkeypatch):
    # Supabase lets anyone with the public anon key sign up: a valid token proves nothing.
    _set_secret(monkeypatch, "test-secret")
    response = TestClient(app).get("/stats", headers={"Authorization": f"Bearer {_token()}"})
    assert response.status_code == 403


def test_user_cannot_grant_themselves_a_role_via_user_metadata(real_auth, monkeypatch):
    _set_secret(monkeypatch, "test-secret")
    token = _token(user_metadata={"role": "gestionnaire"})  # editable by the user: must be ignored
    assert TestClient(app).get("/stats", headers={"Authorization": f"Bearer {token}"}).status_code == 403


def test_manager_role_in_app_metadata_is_accepted(real_auth, monkeypatch):
    _set_secret(monkeypatch, "test-secret")
    token = _token(app_metadata={"role": "gestionnaire"})
    assert TestClient(app).get("/stats", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_staff_emails_allowlist_keeps_legacy_admin_working(real_auth, monkeypatch):
    _set_secret(monkeypatch, "test-secret")
    monkeypatch.setenv("STAFF_EMAILS", "Admin@Example.com")
    get_settings.cache_clear()
    token = _token(email="admin@example.com")
    assert TestClient(app).get("/stats", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_partner_account_requires_actor_link(real_auth, monkeypatch):
    _set_secret(monkeypatch, "test-secret")
    token = _token(app_metadata={"role": "expert"})
    assert TestClient(app).get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 403
