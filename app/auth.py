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
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
