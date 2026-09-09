import io
import os

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.judge.base import Verdict, get_judge
from app.main import app
from app.storage import MemoryStorage, get_storage

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


class StubJudge:
    name, model = "stub", "stub-1"

    def __init__(self) -> None:
        self.verdict = Verdict("pass", 0.9, "책상에서 공부 중입니다.", {})

    async def judge(self, image, appeal_text=None):
        return self.verdict


@pytest.fixture()
def judge():
    return StubJudge()


@pytest.fixture()
def storage():
    return MemoryStorage()


@pytest.fixture()
def client(db, judge, storage):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_judge] = lambda: judge
    app.dependency_overrides[get_storage] = lambda: storage
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth(client, monkeypatch):
    """로그인해서 Authorization 헤더를 돌려준다."""
    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: f"{provider}-{id_token}")
    token = client.post("/auth/social", json={
        "provider": "apple", "id_token": "t", "nickname": "광휘",
    }).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (1600, 1200), (100, 100, 100)).save(buf, format="JPEG")
    return buf.getvalue()
