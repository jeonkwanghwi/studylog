import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite://")


@pytest.fixture(scope="session")
def engine():
    if TEST_DATABASE_URL.startswith("sqlite"):
        eng = create_engine(TEST_DATABASE_URL,
                            connect_args={"check_same_thread": False},
                            poolclass=StaticPool)

        @event.listens_for(eng, "connect")
        def _fk_on(dbapi_conn, _):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

        return eng
    return create_engine(TEST_DATABASE_URL, pool_pre_ping=True)


@pytest.fixture()
def db(engine):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
