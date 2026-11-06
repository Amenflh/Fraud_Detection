from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

security = HTTPBearer(auto_error=False)


@lru_cache
def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    # Newer Supabase projects sign user tokens with asymmetric keys (ES256/RS256)
    # published at this JWKS endpoint, instead of the legacy shared HS256 secret.
    return jwt.PyJWKClient(f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise HTTPException(status_code=503, detail="Supabase auth is not configured on the server")

    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = credentials.credentials
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256":
            key = settings.supabase_jwt_secret
        elif settings.supabase_url:
            key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token).key
        else:
            raise HTTPException(
                status_code=401,
                detail=f"Token signed with {alg}: set SUPABASE_URL on the server to verify it",
            )
        return jwt.decode(
            token,
            key,
            algorithms=["HS256", "ES256", "RS256"],
            audience="authenticated",
            # Tolerates a small clock drift between this machine and Supabase.
            leeway=120,
        )
    except jwt.ImmatureSignatureError as exc:
        raise HTTPException(
            status_code=401,
            detail="Token pas encore valide : l'horloge du serveur est en retard, synchronisez l'heure système.",
        ) from exc
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Session expirée : reconnectez-vous.") from exc
    except jwt.PyJWKClientError as exc:
        raise HTTPException(
            status_code=503,
            detail="Clés Supabase (JWKS) injoignables : vérifiez la connexion Internet du serveur.",
        ) from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


# --- Role-based access ---------------------------------------------------------------------
#
# The role lives in the JWT's `app_metadata.role`: unlike `user_metadata`, a user cannot edit
# it (only the service role can), so it is safe to authorise on. Access is DENIED by default:
# Supabase lets anyone with the public anon key sign up, so "authenticated" proves nothing.
from dataclasses import dataclass  # noqa: E402

ROLES = ("gestionnaire", "agent", "expert", "garage", "assure")
STAFF_ROLES = ("gestionnaire", "agent")  # back-office: see everything
PARTNER_ROLES = ("expert", "garage")  # linked to an `actors` row via app_metadata.actor_id


@dataclass(frozen=True)
class Principal:
    id: str
    email: str
    role: str
    actor_id: str | None = None

    @property
    def is_staff(self) -> bool:
        return self.role in STAFF_ROLES

    @property
    def is_manager(self) -> bool:
        return self.role == "gestionnaire"


def get_principal(claims: dict = Depends(get_current_user)) -> Principal:
    app_meta = claims.get("app_metadata") or {}
    email = str(claims.get("email") or "").strip().lower()
    role = app_meta.get("role")
    if role not in ROLES and email and email in get_settings().staff_email_list:
        role = "gestionnaire"
    if role not in ROLES:
        raise HTTPException(
            status_code=403,
            detail="Compte sans rôle : demandez à un administrateur de vous en attribuer un.",
        )
    actor_id = app_meta.get("actor_id")
    if role in PARTNER_ROLES and not actor_id:
        raise HTTPException(status_code=403, detail="Compte partenaire non rattaché à une fiche (actor_id manquant).")
    return Principal(id=str(claims.get("sub") or ""), email=email, role=role, actor_id=actor_id)


def require_roles(*roles: str):
    """Dependency factory: `Depends(require_roles("gestionnaire"))`."""

    def dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status_code=403, detail="Action non autorisée pour votre rôle.")
        return principal

    return dependency


require_staff = require_roles(*STAFF_ROLES)
require_manager = require_roles("gestionnaire")
