import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.constats import public_router as constats_public_router
from app.api.constats import router as constats_router
from app.api.dossiers import router as dossiers_router
from app.api.rules import router as rules_router
from app.api.rules import saas_router
from app.api.routes import router
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)

    app = FastAPI(title="Insurance Fraud Detection Agents")
    app.include_router(router)
    app.include_router(dossiers_router)
    app.include_router(constats_router)
    app.include_router(constats_public_router)
    app.include_router(rules_router)
    app.include_router(saas_router)
    allowed_origins = [o.strip() for o in settings.cors_allowed_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


app = create_app()
