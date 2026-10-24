from collections.abc import Generator
from functools import lru_cache
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


@lru_cache
def get_engine():
    settings = get_settings()
    url = settings.database_url

    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    if url.startswith("sqlite:///") and ":memory:" not in url:
        db_path = url.replace("sqlite:///", "", 1)
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> sessionmaker:
    return sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()
