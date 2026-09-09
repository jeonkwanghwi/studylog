# StudyLog 서버 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StudyLog v1의 백엔드 — 사진 업로드·AI 판정·세션 타이머·04:00 정산·패스권 결제·푸시 알림을 제공하는 FastAPI 서버를 만든다.

**Architecture:** 단일 FastAPI 프로세스 + Postgres + S3. 사진은 앱이 서버로 직접 multipart POST하고, 서버가 리사이즈 후 S3에 올린 뒤 **같은 요청 안에서 동기로 AI 판정**한다(큐 없음). 타이머는 서버가 요청을 받은 시각의 뺄셈이다. 정산·미종료 세션 회수·알림은 cron이 부르는 배치 함수이며, HTTP 레이어와 분리해 단위 테스트한다.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy 2.0 / Alembic / Postgres 16 / pytest + httpx / Pillow + imagehash / boto3 / anthropic SDK / Expo Push API / RevenueCat 웹훅

**Spec:** [`docs/superpowers/specs/2026-09-09-studylog-v1-design.md`](../specs/2026-09-09-studylog-v1-design.md)

## Global Constraints

- 하루 경계는 **KST 04:00**. 유저별 타임존 없음. 모든 저장 시각은 timezone-aware UTC
- 세션당 상한 **240분**. 미종료 세션은 `counted_minutes = 0`, `status = abandoned`
- 미종료 경고 푸시는 세션 시작 **+3시간 30분**, 회수는 **+4시간**
- 타이머 기준은 **서버가 요청을 받은 시각**(`photos.received_at`). 클라이언트 시각은 어떤 계산에도 쓰지 않는다
- 판정 임계: `decision == "fail" AND confidence >= 0.7` → fail, **그 외 전부 pass**
- 판정 타임아웃 **10초**. 초과하거나 예외가 나면 **pass 처리**하고 로그를 남긴다
- 판정 모델 기본값 `claude-haiku-4-5`. `JUDGE_PROVIDER` / `JUDGE_MODEL` env로 교체 가능
- 이미지는 저장 전 **긴 변 1280px, JPEG quality 80**으로 리사이즈. 원본은 남기지 않는다
- 이의제기는 사진당 **1회**. `verdicts(photo_id, attempt)` unique가 DB 레벨에서 강제한다
- 이의제기가 만드는 시각은 항상 유저에게 불리한 쪽: 시작 샷은 **재판정 시각**, 종료 샷은 **최초 수신 시각**
- 목표 시간 변경은 `pending_goal_minutes`에 쓰고 **다음 04:00 정산 직후** 승격
- 패스권은 한 종류. 사전 방어 **1개**, 사후 복구 **2개** 차감. 복구 시한은 정산 후 **24시간**
- SKU: `pass_3` → 3개, `pass_10` → 10개
- pHash·EXIF는 **저장만** 한다. v1에서 어떤 차단 판단에도 쓰지 않는다
- 모든 금액·시간 상수는 `app/config.py`의 `Settings`에 두고 하드코딩하지 않는다

---

## File Structure

```
server/
  pyproject.toml
  alembic.ini
  alembic/env.py, alembic/versions/
  app/
    config.py          Settings (env)
    db.py              engine / SessionLocal / get_db
    models.py          SQLAlchemy 모델 전부
    schemas.py         Pydantic 요청·응답
    time_utils.py      KST 하루 경계 계산
    security.py        JWT 발급·검증, get_current_user
    storage.py         이미지 리사이즈·pHash·EXIF, PhotoStorage
    notifications.py   Expo Push 전송
    main.py            FastAPI app, 라우터 등록
    judge/
      base.py          Verdict, JudgeProvider, is_pass, judge_photo
      prompt.py        공통 프롬프트 텍스트
      claude.py        Claude 프로바이더
    auth/
      verifiers.py     Apple / Google id_token 검증
    routers/
      auth.py  users.py  groups.py  sessions.py  photos.py  feed.py  webhooks.py
    batch/
      settlement.py    04:00 정산 + pending goal 승격
      sessions.py      미종료 세션 경고·회수
      reminders.py     22:00 리마인드 / 08:00 복구 유도
  tests/
    conftest.py + 태스크별 테스트 파일
  deploy/
    crontab, runbook.md
```

책임 경계: **HTTP 레이어(`routers/`)는 얇게** 두고, 시각 계산·판정 임계·정산 규칙처럼
틀리면 돈과 streak가 걸리는 로직은 전부 순수 함수로 빼서 DB·HTTP 없이 테스트한다.

---

## Task 1: 프로젝트 스캐폴딩과 설정

**Files:**
- Create: `server/pyproject.toml`, `server/app/__init__.py`, `server/app/config.py`, `server/app/db.py`, `server/app/main.py`, `server/.env.example`, `server/.gitignore`
- Test: `server/tests/conftest.py`, `server/tests/test_health.py`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `app.config.settings: Settings`, `app.db.get_db() -> Generator[Session]`, `app.db.Base`, `app.main.app: FastAPI`

- [ ] **Step 1: 의존성 파일 작성**

`server/pyproject.toml`:

```toml
[project]
name = "studylog-server"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy>=2.0",
    "alembic>=1.14",
    "psycopg[binary]>=3.2",
    "pydantic-settings>=2.6",
    "python-multipart>=0.0.17",
    "pyjwt[crypto]>=2.10",
    "httpx>=0.28",
    "pillow>=11.0",
    "imagehash>=4.3",
    "boto3>=1.35",
    "anthropic>=0.40",
]

[project.optional-dependencies]
dev = ["pytest>=8.3", "pytest-asyncio>=0.24", "asgi-lifespan>=2.1"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: 실패하는 테스트 작성**

`server/tests/test_health.py`:

```python
from fastapi.testclient import TestClient
from app.main import app


def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'`

- [ ] **Step 4: 설정 모듈 작성**

`server/app/config.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://studylog:studylog@localhost:5432/studylog"
    jwt_secret: str = "dev-secret-change-me"
    jwt_days: int = 90

    # 스토리지
    s3_bucket: str = "studylog-photos"
    aws_region: str = "ap-northeast-2"
    image_max_edge: int = 1280
    image_jpeg_quality: int = 80

    # 판정
    judge_provider: str = "claude"
    judge_model: str = "claude-haiku-4-5"
    judge_fail_confidence: float = 0.7
    judge_timeout_seconds: float = 10.0
    anthropic_api_key: str = ""

    # 세션
    session_max_minutes: int = 240
    session_warn_minutes: int = 210

    # 결제
    revenuecat_webhook_secret: str = "dev-webhook-secret"
    restore_window_hours: int = 24
    tickets_for_defense: int = 1
    tickets_for_restore: int = 2

    # 알림
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"


settings = Settings()
```

`server/.env.example`은 위 키를 값 없이 나열해 둔다. `server/.gitignore`에 `.env`, `__pycache__/`, `.pytest_cache/`를 넣는다.

- [ ] **Step 5: DB 모듈과 앱 작성**

`server/app/db.py`:

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`server/app/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="StudyLog")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

`server/app/__init__.py`는 빈 파일로 만든다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add server/
git commit -m "feat(server): FastAPI 스캐폴딩과 설정"
```

---

## Task 2: 하루 경계 시간 유틸

정산·피드·복구 시한이 전부 이 함수 위에 올라간다. 여기가 틀리면 밤샘 공부가 전날로
잘못 잡히거나 정산이 하루를 통째로 건너뛴다. DB 없이 순수 함수로 테스트한다.

**Files:**
- Create: `server/app/time_utils.py`
- Test: `server/tests/test_time_utils.py`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `KST: ZoneInfo`
  - `study_day(dt: datetime) -> date` — dt가 속한 공부 하루
  - `day_bounds(day: date) -> tuple[datetime, datetime]` — 그 하루의 [시작, 끝) UTC 구간
  - `now_utc() -> datetime`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_time_utils.py`:

```python
from datetime import UTC, date, datetime

from app.time_utils import KST, day_bounds, study_day


def test_before_4am_belongs_to_previous_day():
    dt = datetime(2026, 9, 9, 3, 59, tzinfo=KST)
    assert study_day(dt) == date(2026, 9, 8)


def test_exactly_4am_starts_new_day():
    dt = datetime(2026, 9, 9, 4, 0, tzinfo=KST)
    assert study_day(dt) == date(2026, 9, 9)


def test_utc_input_is_converted_to_kst_first():
    # 2026-09-08 19:00 UTC == 2026-09-09 04:00 KST
    dt = datetime(2026, 9, 8, 19, 0, tzinfo=UTC)
    assert study_day(dt) == date(2026, 9, 9)


def test_day_bounds_spans_exactly_24_hours_from_4am_kst():
    start, end = day_bounds(date(2026, 9, 9))
    assert start == datetime(2026, 9, 9, 4, 0, tzinfo=KST)
    assert end == datetime(2026, 9, 10, 4, 0, tzinfo=KST)
    assert start.tzinfo is UTC and end.tzinfo is UTC


def test_bounds_and_study_day_agree_at_the_edges():
    day = date(2026, 9, 9)
    start, end = day_bounds(day)
    assert study_day(start) == day
    assert study_day(end) == date(2026, 9, 10)
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_time_utils.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.time_utils'`

- [ ] **Step 3: 구현**

`server/app/time_utils.py`:

```python
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
DAY_START_HOUR = 4


def now_utc() -> datetime:
    return datetime.now(UTC)


def study_day(dt: datetime) -> date:
    """dt가 속한 '공부 하루'를 돌려준다. 하루 경계는 KST 04:00이다."""
    local = dt.astimezone(KST)
    if local.hour < DAY_START_HOUR:
        return (local - timedelta(days=1)).date()
    return local.date()


def day_bounds(day: date) -> tuple[datetime, datetime]:
    """day의 [시작, 끝) 구간을 UTC로 돌려준다."""
    start_kst = datetime.combine(day, time(DAY_START_HOUR), tzinfo=KST)
    end_kst = start_kst + timedelta(days=1)
    return start_kst.astimezone(UTC), end_kst.astimezone(UTC)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_time_utils.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: 커밋**

```bash
git add server/app/time_utils.py server/tests/test_time_utils.py
git commit -m "feat(server): KST 04:00 하루 경계 유틸"
```

---

## Task 3: 데이터 모델과 초기 마이그레이션

**Files:**
- Create: `server/app/models.py`, `server/alembic.ini`, `server/alembic/env.py`, `server/alembic/versions/0001_initial.py`
- Modify: `server/tests/conftest.py`
- Test: `server/tests/test_models.py`

**Interfaces:**
- Consumes: `app.db.Base`, `app.time_utils.now_utc`
- Produces: `User`, `Group`, `Membership`, `Photo`, `StudySession`, `Verdict`, `DailyRecord`, `Purchase` — 모두 `app.models`에서 import 가능. 테스트 픽스처 `db: Session`, `client: TestClient`

스펙 §3에 없던 컬럼 두 개를 추가한다. 스펙의 알림 요구사항(§5)을 만족하려면 필요하다.
- `users.expo_push_token` — 푸시 대상 주소
- `study_sessions.warned_at` — +3h30m 경고를 이미 보냈는지. 없으면 cron이 5분마다 중복 발송한다

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_models.py`:

```python
import pytest
from sqlalchemy.exc import IntegrityError

from app.models import User, Verdict, Photo


def test_same_social_account_cannot_register_twice(db):
    db.add(User(provider="apple", provider_sub="sub-1", nickname="가"))
    db.commit()
    db.add(User(provider="apple", provider_sub="sub-1", nickname="나"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_new_user_starts_with_zero_streak_and_tickets(db):
    user = User(provider="google", provider_sub="sub-2", nickname="다")
    db.add(user)
    db.commit()
    assert user.streak_count == 0
    assert user.pass_tickets == 0
    assert user.pending_goal_minutes is None


def test_a_photo_can_only_be_appealed_once(db):
    user = User(provider="apple", provider_sub="sub-3", nickname="라")
    db.add(user)
    db.flush()
    photo = Photo(user_id=user.id, kind="start", s3_key="k", status="fail")
    db.add(photo)
    db.flush()
    db.add(Verdict(photo_id=photo.id, attempt=1, provider="claude",
                   model="claude-haiku-4-5", decision="fail", confidence=0.9,
                   reason="게임 화면", raw_json={}))
    db.add(Verdict(photo_id=photo.id, attempt=2, provider="claude",
                   model="claude-haiku-4-5", decision="pass", confidence=0.8,
                   reason="인강 화면", raw_json={}, appeal_text="인강입니다"))
    db.commit()

    db.add(Verdict(photo_id=photo.id, attempt=2, provider="claude",
                   model="claude-haiku-4-5", decision="pass", confidence=0.8,
                   reason="또", raw_json={}, appeal_text="또"))
    with pytest.raises(IntegrityError):
        db.commit()
```

- [ ] **Step 2: 테스트 픽스처 작성**

`server/tests/conftest.py`:

**테스트는 SQLite가 아니라 Postgres로 돌린다.** SQLite는 `DateTime(timezone=True)`를
naive로 되돌려주는데, 이 서버 로직의 절반이 시각 뺄셈이라 하필 가장 중요한 곳에서만
거짓말을 하게 된다. `JSON`·`Date`·복합 unique 동작도 프로덕션과 같아진다.

테스트 DB는 미리 띄워 둔다:

```bash
docker run -d --name studylog-test-db -p 5433:5432 \
  -e POSTGRES_USER=studylog -e POSTGRES_PASSWORD=studylog \
  -e POSTGRES_DB=studylog_test postgres:16
```

```python
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://studylog:studylog@localhost:5433/studylog_test",
)


@pytest.fixture(scope="session")
def engine():
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
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models'`

- [ ] **Step 4: 모델 작성**

`server/app/models.py`:

```python
import uuid
from datetime import date as Date
from datetime import datetime

from sqlalchemy import (JSON, Date as SADate, DateTime, Float, ForeignKey,
                        Integer, String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.time_utils import now_utc


def _uuid() -> str:
    return str(uuid.uuid4())


TS = DateTime(timezone=True)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("provider", "provider_sub"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    provider: Mapped[str] = mapped_column(String(16))
    provider_sub: Mapped[str] = mapped_column(String(255))
    nickname: Mapped[str] = mapped_column(String(32))
    daily_goal_minutes: Mapped[int] = mapped_column(Integer, default=60)
    pending_goal_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    streak_count: Mapped[int] = mapped_column(Integer, default=0)
    pass_tickets: Mapped[int] = mapped_column(Integer, default=0)
    expo_push_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=now_utc)


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(40))
    invite_code: Mapped[str] = mapped_column(String(6), unique=True, index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(TS, default=now_utc)


class Membership(Base):
    __tablename__ = "memberships"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(TS, default=now_utc)


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(8))            # start | end
    s3_key: Mapped[str] = mapped_column(String(255))
    phash: Mapped[str | None] = mapped_column(String(32), nullable=True)
    exif_taken_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    received_at: Mapped[datetime] = mapped_column(TS, default=now_utc)
    status: Mapped[str] = mapped_column(String(8))          # pass | fail


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    start_photo_id: Mapped[str] = mapped_column(ForeignKey("photos.id"))
    end_photo_id: Mapped[str | None] = mapped_column(ForeignKey("photos.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(TS)
    ended_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    counted_minutes: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(10))         # open | closed | abandoned
    warned_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class Verdict(Base):
    __tablename__ = "verdicts"
    __table_args__ = (UniqueConstraint("photo_id", "attempt"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    photo_id: Mapped[str] = mapped_column(ForeignKey("photos.id"), index=True)
    attempt: Mapped[int] = mapped_column(Integer)           # 1 | 2
    appeal_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(String(16))
    model: Mapped[str] = mapped_column(String(64))
    decision: Mapped[str] = mapped_column(String(8))
    confidence: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(Text)
    raw_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(TS, default=now_utc)


class DailyRecord(Base):
    __tablename__ = "daily_records"
    __table_args__ = (UniqueConstraint("user_id", "date"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[Date] = mapped_column(SADate)
    total_minutes: Mapped[int] = mapped_column(Integer)
    goal_minutes: Mapped[int] = mapped_column(Integer)
    result: Mapped[str] = mapped_column(String(8))          # success | passed | failed
    pass_tickets_used: Mapped[int] = mapped_column(Integer, default=0)
    streak_snapshot: Mapped[int] = mapped_column(Integer)
    settled_at: Mapped[datetime] = mapped_column(TS, default=now_utc)


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    revenuecat_event_id: Mapped[str] = mapped_column(String(64), unique=True)
    product_id: Mapped[str] = mapped_column(String(32))
    tickets_granted: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(TS, default=now_utc)
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_models.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Alembic 초기화와 첫 마이그레이션**

```bash
cd server
alembic init -t async alembic 2>/dev/null || alembic init alembic
```

`server/alembic/env.py`에서 메타데이터와 URL을 앱 설정에 연결한다:

```python
from app.config import settings
from app.db import Base
import app.models  # noqa: F401  — 모델 등록을 위해 반드시 import

config.set_main_option("sqlalchemy.url", settings.database_url)
target_metadata = Base.metadata
```

그다음:

```bash
alembic revision --autogenerate -m "initial schema"
```

생성된 파일을 `alembic/versions/0001_initial.py`로 이름을 바꾸고, 8개 테이블과
unique 제약 3개(`users(provider, provider_sub)`, `groups.invite_code`,
`verdicts(photo_id, attempt)`, `daily_records(user_id, date)`,
`purchases.revenuecat_event_id`)가 모두 들어갔는지 눈으로 확인한다.

- [ ] **Step 7: 마이그레이션 적용 확인**

Run: `cd server && alembic upgrade head && alembic downgrade base && alembic upgrade head`
Expected: 세 명령 모두 에러 없이 끝난다

- [ ] **Step 8: 커밋**

```bash
git add server/app/models.py server/alembic* server/tests/
git commit -m "feat(server): 데이터 모델과 초기 마이그레이션"
```

---

## Task 4: 소셜 로그인과 인증 의존성

**Files:**
- Create: `server/app/auth/__init__.py`, `server/app/auth/verifiers.py`, `server/app/security.py`, `server/app/schemas.py`, `server/app/routers/__init__.py`, `server/app/routers/auth.py`
- Modify: `server/app/main.py`, `server/app/config.py`
- Test: `server/tests/test_auth.py`

**Interfaces:**
- Consumes: `User`, `get_db`, `settings`
- Produces:
  - `app.auth.verifiers.verify_social_token(provider: str, id_token: str) -> str` — 소셜 계정 sub 반환, 실패 시 `ValueError`
  - `app.security.create_access_token(user_id: str) -> str`
  - `app.security.get_current_user(...) -> User` — FastAPI 의존성
  - `POST /auth/social` → `{"access_token": str, "user": UserOut}`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_auth.py`:

```python
import pytest

from app.models import User


@pytest.fixture(autouse=True)
def fake_social(monkeypatch):
    """소셜 검증은 외부 의존이라 테스트에서는 id_token을 sub로 그대로 쓴다."""
    def _verify(provider: str, id_token: str) -> str:
        if id_token == "bad":
            raise ValueError("invalid token")
        return f"{provider}-{id_token}"

    monkeypatch.setattr("app.routers.auth.verify_social_token", _verify)


def test_first_login_creates_user(client, db):
    r = client.post("/auth/social", json={
        "provider": "apple", "id_token": "tok1", "nickname": "광휘",
    })
    assert r.status_code == 200
    assert r.json()["user"]["nickname"] == "광휘"
    assert db.query(User).count() == 1


def test_second_login_reuses_the_same_user(client, db):
    body = {"provider": "apple", "id_token": "tok1", "nickname": "광휘"}
    first = client.post("/auth/social", json=body).json()
    second = client.post("/auth/social", json=body).json()
    assert first["user"]["id"] == second["user"]["id"]
    assert db.query(User).count() == 1


def test_invalid_social_token_is_rejected(client):
    r = client.post("/auth/social", json={
        "provider": "apple", "id_token": "bad", "nickname": "광휘",
    })
    assert r.status_code == 401


def test_me_requires_a_token(client):
    assert client.get("/users/me").status_code == 403


def test_me_returns_the_logged_in_user(client):
    token = client.post("/auth/social", json={
        "provider": "google", "id_token": "tok2", "nickname": "휘",
    }).json()["access_token"]

    r = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["nickname"] == "휘"
    assert r.json()["pass_tickets"] == 0
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_auth.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.routers'`

- [ ] **Step 3: 설정에 소셜 클라이언트 ID 추가**

`server/app/config.py`의 `Settings`에 추가한다:

```python
    apple_bundle_id: str = "com.studylog.app"
    google_client_id: str = ""
```

- [ ] **Step 4: 소셜 토큰 검증기 작성**

`server/app/auth/verifiers.py`:

```python
import jwt
from jwt import PyJWKClient

from app.config import settings

_JWKS = {
    "apple": ("https://appleid.apple.com/auth/keys", "https://appleid.apple.com"),
    "google": ("https://www.googleapis.com/oauth2/v3/certs", "https://accounts.google.com"),
}
_AUDIENCE = {"apple": lambda: settings.apple_bundle_id,
             "google": lambda: settings.google_client_id}
_clients: dict[str, PyJWKClient] = {}


def _client(url: str) -> PyJWKClient:
    if url not in _clients:
        _clients[url] = PyJWKClient(url, cache_keys=True)
    return _clients[url]


def verify_social_token(provider: str, id_token: str) -> str:
    """소셜 id_token을 검증하고 계정 고유 sub를 돌려준다. 실패하면 ValueError."""
    if provider not in _JWKS:
        raise ValueError(f"unknown provider: {provider}")
    jwks_url, issuer = _JWKS[provider]
    try:
        key = _client(jwks_url).get_signing_key_from_jwt(id_token).key
        claims = jwt.decode(
            id_token, key, algorithms=["RS256"],
            issuer=issuer, audience=_AUDIENCE[provider](),
        )
    except Exception as exc:
        raise ValueError(f"invalid {provider} token") from exc
    return claims["sub"]
```

`server/app/auth/__init__.py`는 빈 파일이다.

- [ ] **Step 5: JWT 발급과 현재 유저 의존성 작성**

`server/app/security.py`:

```python
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User
from app.time_utils import now_utc

bearer = HTTPBearer()


def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now_utc() + timedelta(days=settings.jwt_days)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret,
                             algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")

    user = db.get(User, payload["sub"])
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user
```

- [ ] **Step 6: 스키마와 라우터 작성**

`server/app/schemas.py`:

```python
from pydantic import BaseModel, Field


class SocialLoginIn(BaseModel):
    provider: str = Field(pattern="^(apple|google)$")
    id_token: str
    nickname: str = Field(min_length=1, max_length=32)


class UserOut(BaseModel):
    id: str
    nickname: str
    daily_goal_minutes: int
    pending_goal_minutes: int | None
    streak_count: int
    pass_tickets: int

    model_config = {"from_attributes": True}


class LoginOut(BaseModel):
    access_token: str
    user: UserOut
```

`server/app/routers/auth.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.verifiers import verify_social_token
from app.db import get_db
from app.models import User
from app.schemas import LoginOut, SocialLoginIn
from app.security import create_access_token, get_current_user

router = APIRouter(tags=["auth"])


@router.post("/auth/social", response_model=LoginOut)
def social_login(body: SocialLoginIn, db: Session = Depends(get_db)) -> LoginOut:
    try:
        sub = verify_social_token(body.provider, body.id_token)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid social token")

    user = (db.query(User)
              .filter_by(provider=body.provider, provider_sub=sub)
              .one_or_none())
    if user is None:
        user = User(provider=body.provider, provider_sub=sub, nickname=body.nickname)
        db.add(user)
        db.commit()

    return LoginOut(access_token=create_access_token(user.id), user=user)


@router.get("/users/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
```

`UserOut`을 import에 추가하고, `server/app/routers/__init__.py`는 빈 파일로 만든다.

`server/app/main.py`에 라우터를 등록한다:

```python
from app.routers import auth

app.include_router(auth.router)
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_auth.py -v`
Expected: PASS (5 passed)

- [ ] **Step 8: 커밋**

```bash
git add server/app/auth server/app/security.py server/app/schemas.py server/app/routers server/app/main.py server/app/config.py server/tests/test_auth.py
git commit -m "feat(server): Apple/Google 소셜 로그인과 JWT 인증"
```

---

## Task 5: 판정 어댑터 뼈대와 관대 임계

판정 임계와 타임아웃 폴백은 **틀리면 유저의 공부 시간이 사라지는** 로직이다.
프로바이더 없이 순수 함수로 먼저 고정한다.

**Files:**
- Create: `server/app/judge/__init__.py`, `server/app/judge/base.py`
- Test: `server/tests/test_judge_policy.py`

**Interfaces:**
- Consumes: `settings`
- Produces:
  - `Verdict(decision: str, confidence: float, reason: str, raw: dict)` — frozen dataclass
  - `JudgeProvider` Protocol — `name: str`, `model: str`, `async judge(image: bytes, appeal_text: str | None = None) -> Verdict`
  - `is_pass(verdict: Verdict, fail_threshold: float) -> bool`
  - `async judge_photo(provider: JudgeProvider, image: bytes, appeal_text: str | None = None) -> Verdict`
  - `get_judge() -> JudgeProvider` — FastAPI 의존성

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_judge_policy.py`:

```python
import asyncio

import pytest

from app.judge.base import Verdict, is_pass, judge_photo


def v(decision: str, confidence: float) -> Verdict:
    return Verdict(decision=decision, confidence=confidence, reason="", raw={})


@pytest.mark.parametrize("decision,confidence,expected", [
    ("fail", 0.9, False),   # 확신하는 fail만 거른다
    ("fail", 0.7, False),   # 경계값은 fail 쪽
    ("fail", 0.69, True),   # 확신 없는 fail은 통과
    ("fail", 0.1, True),
    ("pass", 0.1, True),    # 확신 없는 pass도 통과
    ("pass", 0.99, True),
])
def test_only_confident_fails_are_rejected(decision, confidence, expected):
    assert is_pass(v(decision, confidence), 0.7) is expected


class SlowProvider:
    name, model = "slow", "slow-1"

    async def judge(self, image, appeal_text=None):
        await asyncio.sleep(10)
        return v("fail", 1.0)


class BrokenProvider:
    name, model = "broken", "broken-1"

    async def judge(self, image, appeal_text=None):
        raise RuntimeError("API 500")


class FakeProvider:
    name, model = "fake", "fake-1"

    def __init__(self, verdict):
        self.verdict = verdict
        self.seen_appeal = None

    async def judge(self, image, appeal_text=None):
        self.seen_appeal = appeal_text
        return self.verdict


async def test_timeout_passes_leniently(monkeypatch):
    monkeypatch.setattr("app.judge.base.settings.judge_timeout_seconds", 0.01)
    result = await judge_photo(SlowProvider(), b"img")
    assert result.decision == "pass"
    assert "error" in result.raw


async def test_provider_error_passes_leniently():
    result = await judge_photo(BrokenProvider(), b"img")
    assert result.decision == "pass"
    assert "API 500" in result.raw["error"]


async def test_appeal_text_reaches_the_provider():
    provider = FakeProvider(v("pass", 0.8))
    await judge_photo(provider, b"img", appeal_text="인강 듣는 중입니다")
    assert provider.seen_appeal == "인강 듣는 중입니다"
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_judge_policy.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.judge'`

- [ ] **Step 3: 구현**

`server/app/judge/base.py`:

```python
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Protocol

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Verdict:
    decision: str          # "pass" | "fail"
    confidence: float      # 0.0 ~ 1.0
    reason: str
    raw: dict = field(default_factory=dict)


class JudgeProvider(Protocol):
    name: str
    model: str

    async def judge(self, image: bytes, appeal_text: str | None = None) -> Verdict: ...


def is_pass(verdict: Verdict, fail_threshold: float) -> bool:
    """관대 원칙: 확신하는 fail만 거르고 나머지는 전부 통과시킨다."""
    return not (verdict.decision == "fail" and verdict.confidence >= fail_threshold)


async def judge_photo(
    provider: JudgeProvider, image: bytes, appeal_text: str | None = None
) -> Verdict:
    """판정을 부르되, 느리거나 터지면 통과시킨다.

    AI 장애로 유저의 공부 시간이 날아가는 것이 오탐 통과보다 훨씬 나쁘다.
    """
    try:
        return await asyncio.wait_for(
            provider.judge(image, appeal_text),
            timeout=settings.judge_timeout_seconds,
        )
    except Exception as exc:
        logger.warning("판정 실패, 관대 원칙으로 통과 처리: %r", exc)
        return Verdict(
            decision="pass",
            confidence=0.0,
            reason="판정을 받지 못해 통과 처리했습니다.",
            raw={"error": repr(exc)},
        )


def get_judge() -> JudgeProvider:
    """FastAPI 의존성. 프로바이더는 Task 6에서 등록한다."""
    from app.judge.registry import build_provider

    return build_provider(settings.judge_provider, settings.judge_model)
```

`server/app/judge/__init__.py`는 빈 파일이다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_judge_policy.py -v`
Expected: PASS (9 passed)

- [ ] **Step 5: 커밋**

```bash
git add server/app/judge server/tests/test_judge_policy.py
git commit -m "feat(server): 판정 어댑터 뼈대와 관대 임계 정책"
```

---

## Task 6: Claude 프로바이더와 공통 프롬프트

**Files:**
- Create: `server/app/judge/prompt.py`, `server/app/judge/claude.py`, `server/app/judge/registry.py`
- Test: `server/tests/test_judge_claude.py`

**Interfaces:**
- Consumes: `Verdict`
- Produces:
  - `app.judge.prompt.build_prompt(appeal_text: str | None) -> str`
  - `app.judge.prompt.VERDICT_TOOL: dict`
  - `app.judge.claude.ClaudeJudge(model: str, api_key: str)` — `JudgeProvider` 구현
  - `app.judge.registry.build_provider(name: str, model: str) -> JudgeProvider`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_judge_claude.py`:

```python
import pytest

from app.judge.claude import ClaudeJudge, parse_tool_response
from app.judge.prompt import build_prompt
from app.judge.registry import build_provider


def test_prompt_lists_the_wide_pass_range():
    prompt = build_prompt(None)
    for allowed in ["종이책", "노트북", "태블릿", "인강"]:
        assert allowed in prompt
    for rejected in ["게임", "재촬영"]:
        assert rejected in prompt


def test_appeal_text_is_marked_as_a_hint_not_evidence():
    prompt = build_prompt("태블릿으로 인강 듣는 중입니다")
    assert "태블릿으로 인강 듣는 중입니다" in prompt
    assert "참고" in prompt and "이미지" in prompt


def test_parse_reads_the_tool_call():
    class Block:
        type = "tool_use"
        name = "report_verdict"
        input = {"decision": "fail", "confidence": 0.92, "reason": "게임 화면입니다."}

    verdict = parse_tool_response([Block()])
    assert verdict.decision == "fail"
    assert verdict.confidence == 0.92
    assert verdict.raw["decision"] == "fail"


def test_parse_without_a_tool_call_raises():
    class Text:
        type = "text"

    with pytest.raises(ValueError):
        parse_tool_response([Text()])


def test_registry_builds_claude_by_name():
    provider = build_provider("claude", "claude-haiku-4-5")
    assert isinstance(provider, ClaudeJudge)
    assert provider.name == "claude"
    assert provider.model == "claude-haiku-4-5"


def test_registry_rejects_unknown_provider():
    with pytest.raises(ValueError):
        build_provider("nope", "x")
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_judge_claude.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.judge.claude'`

- [ ] **Step 3: 프롬프트 작성**

`server/app/judge/prompt.py`:

```python
BASE_PROMPT = """당신은 공부 인증 사진을 판정한다.

## 통과(pass)시킬 것 — 넓게 인정한다
- 책상·도서관·독서실·학원·카페에서 무언가에 집중하고 있는 장면
- 종이책, 문제집, 노트 필기
- 노트북으로 코딩하거나 문서를 작성하는 화면
- 태블릿 필기, 인강 수강 화면
- 사람이 프레임에 없어도 된다. 학습 환경이 보이면 충분하다
- 조명이 어둡거나 각도가 나빠도, 공부 상황으로 보이면 통과시킨다

## 거를(fail) 것 — 이것만 거른다
- 게임 화면, 예능·드라마·영화, SNS 피드, 쇼핑
- 음식·술자리·풍경 등 공부와 무관한 장면
- 모니터나 다른 기기 화면에 띄운 사진을 다시 찍은 것(재촬영)
- 인쇄물이나 종이에 인쇄된 사진을 찍은 것

## 판정 원칙
확신이 없으면 통과시켜라. 실제로 공부한 사람을 잘못 거르는 것이,
공부하지 않은 사람을 통과시키는 것보다 훨씬 나쁘다.
`confidence`는 그 판정을 얼마나 확신하는지다. 애매하면 0.5 아래로 낮춰라.
`reason`은 한국어 한 문장으로 쓴다."""

APPEAL_TEMPLATE = """

## 유저의 이의제기
이 사진은 앞서 거절됐고, 유저가 다음과 같이 설명했다.

> {appeal_text}

이 설명은 **참고 힌트일 뿐이다.** 판단 근거는 어디까지나 이미지 자체다.
설명이 이미지와 맞지 않으면 설명을 무시하고 이미지대로 판정하라."""

VERDICT_TOOL = {
    "name": "report_verdict",
    "description": "공부 인증 사진에 대한 판정을 보고한다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "decision": {"type": "string", "enum": ["pass", "fail"]},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reason": {"type": "string", "description": "한국어 한 문장"},
        },
        "required": ["decision", "confidence", "reason"],
    },
}


def build_prompt(appeal_text: str | None) -> str:
    if not appeal_text:
        return BASE_PROMPT
    return BASE_PROMPT + APPEAL_TEMPLATE.format(appeal_text=appeal_text)
```

- [ ] **Step 4: 프로바이더와 레지스트리 작성**

`server/app/judge/claude.py`:

```python
import base64

import anthropic

from app.judge.base import Verdict
from app.judge.prompt import VERDICT_TOOL, build_prompt


def parse_tool_response(content: list) -> Verdict:
    for block in content:
        if getattr(block, "type", None) == "tool_use" and block.name == "report_verdict":
            data = dict(block.input)
            return Verdict(
                decision=data["decision"],
                confidence=float(data["confidence"]),
                reason=data["reason"],
                raw=data,
            )
    raise ValueError("응답에 report_verdict 도구 호출이 없습니다")


class ClaudeJudge:
    name = "claude"

    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    async def judge(self, image: bytes, appeal_text: str | None = None) -> Verdict:
        message = await self._client.messages.create(
            model=self.model,
            max_tokens=256,
            tools=[VERDICT_TOOL],
            tool_choice={"type": "tool", "name": "report_verdict"},
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": base64.b64encode(image).decode(),
                    }},
                    {"type": "text", "text": build_prompt(appeal_text)},
                ],
            }],
        )
        return parse_tool_response(message.content)
```

`server/app/judge/registry.py`:

```python
from app.config import settings
from app.judge.base import JudgeProvider
from app.judge.claude import ClaudeJudge


def build_provider(name: str, model: str) -> JudgeProvider:
    if name == "claude":
        return ClaudeJudge(model=model, api_key=settings.anthropic_api_key)
    raise ValueError(f"unknown judge provider: {name}")
```

OpenAI·Gemini 프로바이더는 v1 범위 밖이다(스펙 §10). 레지스트리에 자리만 남긴다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_judge_claude.py -v`
Expected: PASS (6 passed)

- [ ] **Step 6: 커밋**

```bash
git add server/app/judge server/tests/test_judge_claude.py
git commit -m "feat(server): Claude 판정 프로바이더와 공통 프롬프트"
```

---

## Task 7: 이미지 처리와 스토리지

**Files:**
- Create: `server/app/storage.py`
- Test: `server/tests/test_storage.py`

**Interfaces:**
- Consumes: `settings`
- Produces:
  - `ProcessedImage(jpeg: bytes, phash: str, taken_at: datetime | None)` — frozen dataclass
  - `process_image(raw: bytes) -> ProcessedImage`
  - `photo_key(user_id: str, photo_id: str) -> str`
  - `PhotoStorage` Protocol — `put(key: str, data: bytes) -> None`, `get(key: str) -> bytes`
  - `MemoryStorage` — 테스트용, `.items: dict[str, bytes]`
  - `get_storage() -> PhotoStorage` — FastAPI 의존성

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_storage.py`:

```python
import io

from PIL import Image

from app.storage import MemoryStorage, photo_key, process_image


def make_jpeg(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (120, 90, 60)).save(buf, format="JPEG")
    return buf.getvalue()


def test_long_edge_is_capped_at_1280():
    processed = process_image(make_jpeg(4032, 3024))
    out = Image.open(io.BytesIO(processed.jpeg))
    assert max(out.size) == 1280
    assert out.size == (1280, 960)   # 가로세로비 유지


def test_small_images_are_not_upscaled():
    processed = process_image(make_jpeg(800, 600))
    assert Image.open(io.BytesIO(processed.jpeg)).size == (800, 600)


def test_resize_shrinks_the_payload():
    raw = make_jpeg(4032, 3024)
    assert len(process_image(raw).jpeg) < len(raw)


def test_output_is_always_jpeg():
    buf = io.BytesIO()
    Image.new("RGBA", (900, 900), (10, 20, 30, 255)).save(buf, format="PNG")
    processed = process_image(buf.getvalue())
    assert Image.open(io.BytesIO(processed.jpeg)).format == "JPEG"


def test_phash_is_stable_and_distinguishes_images():
    a = process_image(make_jpeg(1000, 1000)).phash
    again = process_image(make_jpeg(1000, 1000)).phash
    assert a == again
    assert isinstance(a, str) and len(a) == 16


def test_missing_exif_yields_none():
    assert process_image(make_jpeg(600, 600)).taken_at is None


def test_photo_key_is_namespaced_by_user():
    assert photo_key("u1", "p1") == "photos/u1/p1.jpg"


def test_memory_storage_round_trips():
    storage = MemoryStorage()
    storage.put("k", b"bytes")
    assert storage.items["k"] == b"bytes"
    assert storage.get("k") == b"bytes"
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_storage.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.storage'`

- [ ] **Step 3: 구현**

`server/app/storage.py`:

```python
import io
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

import boto3
import imagehash
from PIL import Image, ExifTags

from app.config import settings

_EXIF_DATETIME_ORIGINAL = next(
    tag for tag, name in ExifTags.TAGS.items() if name == "DateTimeOriginal"
)


@dataclass(frozen=True)
class ProcessedImage:
    jpeg: bytes
    phash: str
    taken_at: datetime | None


def _read_taken_at(image: Image.Image) -> datetime | None:
    try:
        exif = image.getexif()
        raw = exif.get(_EXIF_DATETIME_ORIGINAL)
        if not raw:
            return None
        return datetime.strptime(raw, "%Y:%m:%d %H:%M:%S")
    except Exception:
        return None


def process_image(raw: bytes) -> ProcessedImage:
    """긴 변 1280px·JPEG q80으로 줄이고, pHash와 EXIF 촬영시각을 뽑는다.

    원본은 어디에도 남기지 않는다. S3 비용과 vision 입력 토큰이 함께 줄어든다.
    """
    image = Image.open(io.BytesIO(raw))
    taken_at = _read_taken_at(image)
    phash = str(imagehash.phash(image))

    image = image.convert("RGB")
    longest = max(image.size)
    if longest > settings.image_max_edge:
        ratio = settings.image_max_edge / longest
        new_size = (round(image.width * ratio), round(image.height * ratio))
        image = image.resize(new_size, Image.LANCZOS)

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=settings.image_jpeg_quality, optimize=True)
    return ProcessedImage(jpeg=buf.getvalue(), phash=phash, taken_at=taken_at)


def photo_key(user_id: str, photo_id: str) -> str:
    return f"photos/{user_id}/{photo_id}.jpg"


class PhotoStorage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes: ...


class S3Storage:
    def __init__(self, bucket: str, region: str) -> None:
        self.bucket = bucket
        self._client = boto3.client("s3", region_name=region)

    def put(self, key: str, data: bytes) -> None:
        self._client.put_object(
            Bucket=self.bucket, Key=key, Body=data, ContentType="image/jpeg"
        )

    def get(self, key: str) -> bytes:
        return self._client.get_object(Bucket=self.bucket, Key=key)["Body"].read()


@dataclass
class MemoryStorage:
    """테스트용. put한 것을 그대로 들고 있는다."""
    items: dict[str, bytes] = field(default_factory=dict)

    def put(self, key: str, data: bytes) -> None:
        self.items[key] = data

    def get(self, key: str) -> bytes:
        return self.items[key]


def get_storage() -> PhotoStorage:
    return S3Storage(settings.s3_bucket, settings.aws_region)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_storage.py -v`
Expected: PASS (8 passed)

`get`은 이의제기 재판정이 S3에서 사진을 다시 읽을 때 쓴다(Task 10).

- [ ] **Step 5: 커밋**

```bash
git add server/app/storage.py server/tests/test_storage.py
git commit -m "feat(server): 이미지 리사이즈·pHash·S3 스토리지"
```

---

## Task 8: 세션 시작 API

**Files:**
- Create: `server/app/domain.py`, `server/app/routers/sessions.py`
- Modify: `server/app/schemas.py`, `server/app/main.py`, `server/tests/conftest.py`
- Test: `server/tests/test_domain.py`, `server/tests/test_session_start.py`

**Interfaces:**
- Consumes: `get_current_user`, `process_image`, `photo_key`, `get_storage`, `get_judge`, `judge_photo`, `is_pass`, `Photo`, `StudySession`, `Verdict`
- Produces:
  - `app.domain.counted_minutes(started_at: datetime, ended_at: datetime, cap: int) -> int`
  - `app.routers.sessions.ingest_photo(db, user, kind, image, storage, judge, received_at, attempt=1, appeal_text=None) -> tuple[Photo, bool]`
  - `POST /sessions/start` (multipart `image`) → `JudgeResultOut`
  - `GET /sessions/current` → `SessionOut | null`
  - 테스트 픽스처 `auth(client) -> dict` (Authorization 헤더), `storage`, `set_verdict(decision, confidence)`

- [ ] **Step 1: 순수 규칙 테스트 작성**

`server/tests/test_domain.py`:

```python
from datetime import UTC, datetime, timedelta

from app.domain import counted_minutes

BASE = datetime(2026, 9, 9, 10, 0, tzinfo=UTC)


def test_counts_whole_minutes_only():
    assert counted_minutes(BASE, BASE + timedelta(minutes=90, seconds=59), 240) == 90


def test_capped_at_the_session_limit():
    assert counted_minutes(BASE, BASE + timedelta(hours=6), 240) == 240


def test_never_negative():
    assert counted_minutes(BASE, BASE - timedelta(minutes=5), 240) == 0
```

- [ ] **Step 2: 공용 테스트 픽스처 추가**

`server/tests/conftest.py`에 추가한다:

```python
import io

import pytest
from PIL import Image

from app.judge.base import Verdict, get_judge
from app.storage import MemoryStorage, get_storage


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
```

기존 `client` 픽스처는 위 버전으로 교체한다.

- [ ] **Step 3: 실패하는 API 테스트 작성**

`server/tests/test_session_start.py`:

```python
from app.judge.base import Verdict
from app.models import Photo, StudySession, Verdict as VerdictRow


def start(client, auth, jpeg):
    return client.post("/sessions/start", headers=auth,
                       files={"image": ("shot.jpg", jpeg, "image/jpeg")})


def test_pass_opens_a_session(client, auth, jpeg, db):
    r = start(client, auth, jpeg)
    assert r.status_code == 200
    body = r.json()
    assert body["result"] == "pass"
    assert body["session"]["status"] == "open"

    session = db.query(StudySession).one()
    photo = db.query(Photo).one()
    assert session.start_photo_id == photo.id
    assert session.started_at == photo.received_at
    assert photo.kind == "start" and photo.status == "pass"


def test_confident_fail_does_not_open_a_session(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임 화면입니다.", {})
    body = start(client, auth, jpeg).json()

    assert body["result"] == "fail"
    assert body["session"] is None
    assert body["reason"] == "게임 화면입니다."
    assert db.query(StudySession).count() == 0
    assert db.query(Photo).one().status == "fail"


def test_unconfident_fail_still_opens_a_session(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.4, "잘 모르겠습니다.", {})
    assert start(client, auth, jpeg).json()["result"] == "pass"
    assert db.query(StudySession).count() == 1


def test_verdict_row_is_always_recorded(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임 화면입니다.", {"k": "v"})
    start(client, auth, jpeg)

    row = db.query(VerdictRow).one()
    assert row.attempt == 1
    assert row.provider == "stub" and row.model == "stub-1"
    assert row.decision == "fail" and row.confidence == 0.95
    assert row.raw_json == {"k": "v"}
    assert row.appeal_text is None


def test_resized_image_is_stored(client, auth, jpeg, db, storage):
    start(client, auth, jpeg)
    photo = db.query(Photo).one()
    assert photo.s3_key in storage.items
    assert len(storage.items[photo.s3_key]) < len(jpeg)


def test_second_start_while_open_is_rejected(client, auth, jpeg, db):
    start(client, auth, jpeg)
    r = start(client, auth, jpeg)
    assert r.status_code == 409
    assert db.query(StudySession).count() == 1


def test_current_returns_the_open_session(client, auth, jpeg):
    assert client.get("/sessions/current", headers=auth).json() is None
    start(client, auth, jpeg)
    assert client.get("/sessions/current", headers=auth).json()["status"] == "open"
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_domain.py tests/test_session_start.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.domain'`

- [ ] **Step 5: 순수 규칙 작성**

`server/app/domain.py`:

```python
from datetime import datetime


def counted_minutes(started_at: datetime, ended_at: datetime, cap: int) -> int:
    """세션이 인정받는 분. 상한을 넘지 않고 음수가 되지 않는다."""
    elapsed = int((ended_at - started_at).total_seconds() // 60)
    return max(0, min(elapsed, cap))
```

- [ ] **Step 6: 스키마 추가**

`server/app/schemas.py`에 추가한다:

```python
from datetime import datetime


class SessionOut(BaseModel):
    id: str
    started_at: datetime
    ended_at: datetime | None
    counted_minutes: int
    status: str

    model_config = {"from_attributes": True}


class JudgeResultOut(BaseModel):
    result: str                       # "pass" | "fail"
    photo_id: str
    reason: str
    session: SessionOut | None = None
```

- [ ] **Step 7: 라우터 작성**

`server/app/routers/sessions.py`:

```python
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.judge.base import JudgeProvider, get_judge, is_pass, judge_photo
from app.models import Photo, StudySession, User, Verdict
from app.schemas import JudgeResultOut, SessionOut
from app.security import get_current_user
from app.storage import PhotoStorage, get_storage, photo_key, process_image
from app.time_utils import now_utc

router = APIRouter(tags=["sessions"])


async def ingest_photo(
    db: Session, user: User, kind: str, image: bytes,
    storage: PhotoStorage, judge: JudgeProvider, received_at,
    attempt: int = 1, appeal_text: str | None = None,
) -> tuple[Photo, bool]:
    """사진을 저장하고 판정한다. (photo, 통과 여부)를 돌려준다."""
    processed = process_image(image)
    photo_id = str(uuid.uuid4())
    key = photo_key(user.id, photo_id)
    storage.put(key, processed.jpeg)

    photo = Photo(id=photo_id, user_id=user.id, kind=kind, s3_key=key,
                  phash=processed.phash, exif_taken_at=processed.taken_at,
                  received_at=received_at, status="pass")
    db.add(photo)

    verdict = await judge_photo(judge, processed.jpeg, appeal_text)
    ok = is_pass(verdict, settings.judge_fail_confidence)
    photo.status = "pass" if ok else "fail"

    db.add(Verdict(photo_id=photo.id, attempt=attempt, appeal_text=appeal_text,
                   provider=judge.name, model=judge.model,
                   decision=verdict.decision, confidence=verdict.confidence,
                   reason=verdict.reason, raw_json=verdict.raw))
    db.flush()
    return photo, ok


def _open_session(db: Session, user_id: str) -> StudySession | None:
    return (db.query(StudySession)
              .filter_by(user_id=user_id, status="open")
              .one_or_none())


def _last_reason(db: Session, photo_id: str) -> str:
    row = (db.query(Verdict).filter_by(photo_id=photo_id)
             .order_by(Verdict.attempt.desc()).first())
    return row.reason if row else ""


@router.post("/sessions/start", response_model=JudgeResultOut)
async def start_session(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
    judge: JudgeProvider = Depends(get_judge),
) -> JudgeResultOut:
    received_at = now_utc()          # 타이머 기준은 요청이 도착한 시각이다
    if _open_session(db, user.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 진행 중인 세션이 있습니다")

    photo, ok = await ingest_photo(
        db, user, "start", await image.read(), storage, judge, received_at
    )
    session = None
    if ok:
        session = StudySession(user_id=user.id, start_photo_id=photo.id,
                               started_at=photo.received_at, status="open")
        db.add(session)
    db.commit()

    return JudgeResultOut(
        result="pass" if ok else "fail",
        photo_id=photo.id,
        reason=_last_reason(db, photo.id),
        session=SessionOut.model_validate(session) if session else None,
    )


@router.get("/sessions/current", response_model=SessionOut | None)
def current_session(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> StudySession | None:
    return _open_session(db, user.id)
```

`server/app/main.py`에 `app.include_router(sessions.router)`를 추가한다.

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_domain.py tests/test_session_start.py -v`
Expected: PASS (10 passed)

- [ ] **Step 9: 커밋**

```bash
git add server/app/domain.py server/app/routers/sessions.py server/app/schemas.py server/app/main.py server/tests/
git commit -m "feat(server): 세션 시작 API와 동기 판정"
```

---

## Task 9: 세션 종료 API

**Files:**
- Modify: `server/app/routers/sessions.py`
- Test: `server/tests/test_session_end.py`

**Interfaces:**
- Consumes: `ingest_photo`, `counted_minutes`, `_open_session`
- Produces: `POST /sessions/{session_id}/end` (multipart `image`) → `JudgeResultOut`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_session_end.py`:

```python
from datetime import timedelta

from app.judge.base import Verdict
from app.models import Photo, StudySession


def start(client, auth, jpeg):
    return client.post("/sessions/start", headers=auth,
                       files={"image": ("s.jpg", jpeg, "image/jpeg")}).json()


def end(client, auth, jpeg, session_id):
    return client.post(f"/sessions/{session_id}/end", headers=auth,
                       files={"image": ("e.jpg", jpeg, "image/jpeg")})


def test_pass_closes_the_session_and_counts_minutes(client, auth, jpeg, db):
    session_id = start(client, auth, jpeg)["session"]["id"]
    session = db.get(StudySession, session_id)
    session.started_at = session.started_at - timedelta(minutes=95)
    db.commit()

    body = end(client, auth, jpeg, session_id).json()
    assert body["result"] == "pass"
    assert body["session"]["status"] == "closed"
    assert body["session"]["counted_minutes"] == 95

    db.refresh(session)
    assert session.end_photo_id is not None
    assert session.ended_at is not None


def test_minutes_are_capped_at_four_hours(client, auth, jpeg, db):
    session_id = start(client, auth, jpeg)["session"]["id"]
    session = db.get(StudySession, session_id)
    session.started_at = session.started_at - timedelta(hours=7)
    db.commit()

    body = end(client, auth, jpeg, session_id).json()
    assert body["session"]["counted_minutes"] == 240


def test_fail_keeps_the_session_open(client, auth, jpeg, db, judge):
    session_id = start(client, auth, jpeg)["session"]["id"]
    judge.verdict = Verdict("fail", 0.95, "음식 사진입니다.", {})

    body = end(client, auth, jpeg, session_id).json()
    assert body["result"] == "fail"
    assert body["session"] is None

    session = db.get(StudySession, session_id)
    assert session.status == "open"
    assert session.end_photo_id is None
    assert db.query(Photo).filter_by(kind="end").one().status == "fail"


def test_cannot_end_someone_elses_session(client, auth, jpeg, db, monkeypatch):
    session_id = start(client, auth, jpeg)["session"]["id"]
    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: f"{provider}-other")
    other = client.post("/auth/social", json={
        "provider": "apple", "id_token": "x", "nickname": "남",
    }).json()["access_token"]

    r = end(client, {"Authorization": f"Bearer {other}"}, jpeg, session_id)
    assert r.status_code == 404


def test_cannot_end_a_closed_session(client, auth, jpeg):
    session_id = start(client, auth, jpeg)["session"]["id"]
    end(client, auth, jpeg, session_id)
    assert end(client, auth, jpeg, session_id).status_code == 404
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_session_end.py -v`
Expected: FAIL — 404 (엔드포인트 없음)

- [ ] **Step 3: 구현**

`server/app/routers/sessions.py`에 추가한다:

```python
from app.domain import counted_minutes


@router.post("/sessions/{session_id}/end", response_model=JudgeResultOut)
async def end_session(
    session_id: str,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
    judge: JudgeProvider = Depends(get_judge),
) -> JudgeResultOut:
    received_at = now_utc()
    session = (db.query(StudySession)
                 .filter_by(id=session_id, user_id=user.id, status="open")
                 .one_or_none())
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "진행 중인 세션이 아닙니다")

    photo, ok = await ingest_photo(
        db, user, "end", await image.read(), storage, judge, received_at
    )
    if ok:
        close_session(session, photo)
    db.commit()

    return JudgeResultOut(
        result="pass" if ok else "fail",
        photo_id=photo.id,
        reason=_last_reason(db, photo.id),
        session=SessionOut.model_validate(session) if ok else None,
    )


def close_session(session: StudySession, end_photo: Photo) -> None:
    """종료 샷이 통과했을 때 세션을 닫는다. 이의제기(Task 10)도 이걸 쓴다."""
    session.end_photo_id = end_photo.id
    session.ended_at = end_photo.received_at
    session.counted_minutes = counted_minutes(
        session.started_at, end_photo.received_at, settings.session_max_minutes
    )
    session.status = "closed"
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_session_end.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: 커밋**

```bash
git add server/app/routers/sessions.py server/tests/test_session_end.py
git commit -m "feat(server): 세션 종료 API와 시간 상한"
```

---

## Task 10: 이의제기 재판정

**시각 정책이 이 태스크의 핵심이다.** 이의제기가 만드는 시각을 유저에게 유리하게
잡으면, 시작 샷을 찍고 3시간 놀다가 이의제기로 통과시켜 3시간을 적립할 수 있다.
**시작 샷은 재판정 시각, 종료 샷은 최초 수신 시각** — 양쪽 다 불리한 쪽을 택한다.

**Files:**
- Create: `server/app/routers/photos.py`
- Modify: `server/app/schemas.py`, `server/app/main.py`
- Test: `server/tests/test_appeal.py`

**Interfaces:**
- Consumes: `judge_photo`, `is_pass`, `close_session`, `storage.get`, `DailyRecord`, `study_day`
- Produces: `POST /photos/{photo_id}/appeal` body `{"text": str}` → `JudgeResultOut`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_appeal.py`:

```python
from datetime import timedelta

from app.judge.base import Verdict
from app.models import DailyRecord, Photo, StudySession, Verdict as VerdictRow
from app.time_utils import now_utc, study_day


def start(client, auth, jpeg):
    return client.post("/sessions/start", headers=auth,
                       files={"image": ("s.jpg", jpeg, "image/jpeg")}).json()


def appeal(client, auth, photo_id, text="태블릿으로 인강 듣는 중입니다"):
    return client.post(f"/photos/{photo_id}/appeal", headers=auth, json={"text": text})


def test_successful_appeal_on_a_start_shot_opens_a_session(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "화면만 보입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]

    judge.verdict = Verdict("pass", 0.85, "인강 화면입니다.", {})
    body = appeal(client, auth, photo_id).json()

    assert body["result"] == "pass"
    assert body["session"]["status"] == "open"
    assert db.get(Photo, photo_id).status == "pass"


def test_start_shot_appeal_uses_the_rejudge_time_not_the_original(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "화면만 보입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]

    photo = db.get(Photo, photo_id)
    photo.received_at = photo.received_at - timedelta(hours=3)
    db.commit()

    judge.verdict = Verdict("pass", 0.85, "인강 화면입니다.", {})
    appeal(client, auth, photo_id)

    session = db.query(StudySession).one()
    assert session.started_at > photo.received_at + timedelta(hours=2)


def test_end_shot_appeal_uses_the_original_receive_time(client, auth, jpeg, db, judge):
    session_id = start(client, auth, jpeg)["session"]["id"]
    session = db.get(StudySession, session_id)
    session.started_at = session.started_at - timedelta(minutes=60)
    db.commit()

    judge.verdict = Verdict("fail", 0.95, "음식입니다.", {})
    end_photo_id = client.post(f"/sessions/{session_id}/end", headers=auth,
                               files={"image": ("e.jpg", jpeg, "image/jpeg")}
                               ).json()["photo_id"]

    end_photo = db.get(Photo, end_photo_id)
    original = end_photo.received_at

    judge.verdict = Verdict("pass", 0.85, "노트 필기입니다.", {})
    body = appeal(client, auth, end_photo_id).json()

    db.refresh(session)
    assert session.status == "closed"
    assert session.ended_at == original
    assert body["session"]["counted_minutes"] == 60


def test_appeal_records_attempt_two_with_the_text(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]

    judge.verdict = Verdict("pass", 0.8, "코딩 화면입니다.", {})
    appeal(client, auth, photo_id, text="파이썬 코딩 중입니다")

    rows = {r.attempt: r for r in db.query(VerdictRow).filter_by(photo_id=photo_id)}
    assert rows[1].appeal_text is None
    assert rows[2].appeal_text == "파이썬 코딩 중입니다"
    assert rows[2].decision == "pass"


def test_second_appeal_is_rejected(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]
    appeal(client, auth, photo_id)
    assert appeal(client, auth, photo_id).status_code == 409


def test_cannot_appeal_a_passing_photo(client, auth, jpeg):
    photo_id = start(client, auth, jpeg)["photo_id"]
    assert appeal(client, auth, photo_id).status_code == 409


def test_cannot_appeal_after_the_day_is_settled(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]
    photo = db.get(Photo, photo_id)

    db.add(DailyRecord(user_id=photo.user_id, date=study_day(photo.received_at),
                       total_minutes=0, goal_minutes=60, result="failed",
                       streak_snapshot=0, settled_at=now_utc()))
    db.commit()

    assert appeal(client, auth, photo_id).status_code == 409


def test_failed_appeal_changes_nothing(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]

    judge.verdict = Verdict("fail", 0.9, "여전히 게임입니다.", {})
    body = appeal(client, auth, photo_id).json()

    assert body["result"] == "fail"
    assert db.get(Photo, photo_id).status == "fail"
    assert db.query(StudySession).count() == 0
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_appeal.py -v`
Expected: FAIL — 404 (엔드포인트 없음)

- [ ] **Step 3: 스키마 추가**

`server/app/schemas.py`에 추가한다:

```python
class AppealIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
```

- [ ] **Step 4: 라우터 작성**

`server/app/routers/photos.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.judge.base import JudgeProvider, get_judge, is_pass, judge_photo
from app.models import DailyRecord, Photo, StudySession, User, Verdict
from app.routers.sessions import close_session
from app.schemas import AppealIn, JudgeResultOut, SessionOut
from app.security import get_current_user
from app.storage import PhotoStorage, get_storage
from app.time_utils import now_utc, study_day

router = APIRouter(tags=["photos"])


@router.post("/photos/{photo_id}/appeal", response_model=JudgeResultOut)
async def appeal_photo(
    photo_id: str,
    body: AppealIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
    judge: JudgeProvider = Depends(get_judge),
) -> JudgeResultOut:
    photo = (db.query(Photo).filter_by(id=photo_id, user_id=user.id).one_or_none())
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사진을 찾을 수 없습니다")
    if photo.status != "fail":
        raise HTTPException(status.HTTP_409_CONFLICT, "거절된 사진만 이의제기할 수 있습니다")
    if db.query(Verdict).filter_by(photo_id=photo.id, attempt=2).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "이의제기는 한 번만 가능합니다")

    day = study_day(photo.received_at)
    if db.query(DailyRecord).filter_by(user_id=user.id, date=day).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 정산된 날입니다")

    rejudged_at = now_utc()
    verdict = await judge_photo(judge, storage.get(photo.s3_key), body.text)
    ok = is_pass(verdict, settings.judge_fail_confidence)

    db.add(Verdict(photo_id=photo.id, attempt=2, appeal_text=body.text,
                   provider=judge.name, model=judge.model,
                   decision=verdict.decision, confidence=verdict.confidence,
                   reason=verdict.reason, raw_json=verdict.raw))

    session = None
    if ok:
        photo.status = "pass"
        session = _apply_passed_appeal(db, user, photo, rejudged_at)
    db.commit()

    return JudgeResultOut(
        result="pass" if ok else "fail",
        photo_id=photo.id,
        reason=verdict.reason,
        session=SessionOut.model_validate(session) if session else None,
    )


def _apply_passed_appeal(
    db: Session, user: User, photo: Photo, rejudged_at
) -> StudySession | None:
    """이의제기가 만드는 시각은 항상 유저에게 불리한 쪽으로 잡는다.

    시작 샷에 최초 수신 시각을 쓰면 "찍어두고 놀다가 이의제기"로 시간을 벌 수 있고,
    종료 샷에 재판정 시각을 쓰면 이의제기를 오래 끌수록 시간이 늘어난다.
    """
    if photo.kind == "start":
        if db.query(StudySession).filter_by(user_id=user.id, status="open").count():
            return None
        session = StudySession(user_id=user.id, start_photo_id=photo.id,
                               started_at=rejudged_at, status="open")
        db.add(session)
        db.flush()
        return session

    session = (db.query(StudySession)
                 .filter_by(user_id=user.id, status="open")
                 .one_or_none())
    if session is None:
        return None
    close_session(session, photo)          # ended_at = photo.received_at
    return session
```

`server/app/main.py`에 `app.include_router(photos.router)`를 추가한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_appeal.py -v`
Expected: PASS (8 passed)

- [ ] **Step 6: 커밋**

```bash
git add server/app/routers/photos.py server/app/schemas.py server/app/main.py server/tests/test_appeal.py
git commit -m "feat(server): 이의제기 재판정과 불리한 시각 채택 규칙"
```

---

## Task 11: 목표 시간 변경과 푸시 토큰 등록

목표를 즉시 반영하면 밤 10시에 10분으로 낮춰 무조건 `success`를 만들 수 있다.
변경은 `pending_goal_minutes`에만 쓰고, 승격은 정산 배치(Task 15)가 한다.

**Files:**
- Create: `server/app/routers/users.py`
- Modify: `server/app/schemas.py`, `server/app/main.py`, `server/app/routers/auth.py`
- Test: `server/tests/test_users.py`

**Interfaces:**
- Consumes: `get_current_user`
- Produces:
  - `PATCH /users/me/goal` body `{"minutes": int}` → `UserOut`
  - `PUT /users/me/push-token` body `{"token": str}` → `204`
  - `GET /users/me` (Task 4의 핸들러를 이 라우터로 옮긴다)

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_users.py`:

```python
from app.models import User


def test_goal_change_is_staged_not_applied(client, auth, db):
    r = client.patch("/users/me/goal", headers=auth, json={"minutes": 30})
    assert r.status_code == 200
    body = r.json()
    assert body["daily_goal_minutes"] == 60      # 오늘 목표는 그대로
    assert body["pending_goal_minutes"] == 30    # 내일부터 적용


def test_latest_change_wins_before_settlement(client, auth, db):
    client.patch("/users/me/goal", headers=auth, json={"minutes": 30})
    client.patch("/users/me/goal", headers=auth, json={"minutes": 120})
    assert db.query(User).one().pending_goal_minutes == 120


def test_goal_must_be_within_bounds(client, auth):
    assert client.patch("/users/me/goal", headers=auth, json={"minutes": 0}).status_code == 422
    assert client.patch("/users/me/goal", headers=auth, json={"minutes": 1441}).status_code == 422


def test_push_token_is_saved(client, auth, db):
    r = client.put("/users/me/push-token", headers=auth,
                   json={"token": "ExponentPushToken[abc]"})
    assert r.status_code == 204
    assert db.query(User).one().expo_push_token == "ExponentPushToken[abc]"


def test_goal_change_requires_auth(client):
    assert client.patch("/users/me/goal", json={"minutes": 30}).status_code == 403
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_users.py -v`
Expected: FAIL — 405 또는 404 (엔드포인트 없음)

- [ ] **Step 3: 스키마 추가**

`server/app/schemas.py`에 추가한다:

```python
class GoalIn(BaseModel):
    minutes: int = Field(ge=1, le=1440)


class PushTokenIn(BaseModel):
    token: str = Field(min_length=1, max_length=255)
```

- [ ] **Step 4: 라우터 작성**

`server/app/routers/users.py`:

```python
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import GoalIn, PushTokenIn, UserOut
from app.security import get_current_user

router = APIRouter(prefix="/users/me", tags=["users"])


@router.get("", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/goal", response_model=UserOut)
def change_goal(
    body: GoalIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    """변경은 다음 04:00 정산 직후에 적용된다(Task 15). 즉시 반영하지 않는다."""
    user.pending_goal_minutes = body.minutes
    db.commit()
    return user


@router.put("/push-token", status_code=status.HTTP_204_NO_CONTENT)
def set_push_token(
    body: PushTokenIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    user.expo_push_token = body.token
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

`server/app/routers/auth.py`에서 `GET /users/me` 핸들러를 삭제하고,
`server/app/main.py`에 `app.include_router(users.router)`를 추가한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_users.py tests/test_auth.py -v`
Expected: PASS (10 passed)

- [ ] **Step 6: 커밋**

```bash
git add server/app/routers/users.py server/app/routers/auth.py server/app/schemas.py server/app/main.py server/tests/test_users.py
git commit -m "feat(server): 목표 시간 예약 변경과 푸시 토큰 등록"
```

---

## Task 12: 그룹 생성과 초대코드 참여

**Files:**
- Create: `server/app/routers/groups.py`
- Modify: `server/app/domain.py`, `server/app/schemas.py`, `server/app/main.py`
- Test: `server/tests/test_groups.py`

**Interfaces:**
- Consumes: `get_current_user`, `Group`, `Membership`
- Produces:
  - `app.domain.generate_invite_code(rng=None) -> str` — 6자리, 혼동 문자 제외
  - `POST /groups` body `{"name": str}` → `GroupOut`
  - `POST /groups/join` body `{"invite_code": str}` → `GroupOut`
  - `GET /groups` → `list[GroupOut]`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_groups.py`:

```python
import random

from app.domain import INVITE_ALPHABET, generate_invite_code
from app.models import Membership


def test_invite_code_avoids_lookalike_characters():
    code = generate_invite_code(random.Random(7))
    assert len(code) == 6
    assert set(code) <= set(INVITE_ALPHABET)
    assert not (set("O0I1") & set(INVITE_ALPHABET))


def test_creating_a_group_makes_the_owner_a_member(client, auth, db):
    r = client.post("/groups", headers=auth, json={"name": "고시반"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "고시반"
    assert len(body["invite_code"]) == 6
    assert db.query(Membership).filter_by(group_id=body["id"]).count() == 1


def test_joining_with_a_code_adds_a_membership(client, auth, db, monkeypatch):
    code = client.post("/groups", headers=auth, json={"name": "고시반"}).json()["invite_code"]

    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: "apple-friend")
    friend = {"Authorization": "Bearer " + client.post("/auth/social", json={
        "provider": "apple", "id_token": "f", "nickname": "친구",
    }).json()["access_token"]}

    r = client.post("/groups/join", headers=friend, json={"invite_code": code})
    assert r.status_code == 200
    assert db.query(Membership).count() == 2


def test_unknown_code_is_rejected(client, auth):
    r = client.post("/groups/join", headers=auth, json={"invite_code": "ZZZZZZ"})
    assert r.status_code == 404


def test_joining_twice_is_idempotent(client, auth, db):
    code = client.post("/groups", headers=auth, json={"name": "고시반"}).json()["invite_code"]
    assert client.post("/groups/join", headers=auth, json={"invite_code": code}).status_code == 200
    assert db.query(Membership).count() == 1


def test_a_user_can_belong_to_several_groups(client, auth, db):
    client.post("/groups", headers=auth, json={"name": "고시반"})
    client.post("/groups", headers=auth, json={"name": "회사 동료"})

    names = {g["name"] for g in client.get("/groups", headers=auth).json()}
    assert names == {"고시반", "회사 동료"}
    assert db.query(Membership).count() == 2


def test_group_list_is_empty_for_a_new_user(client, auth):
    assert client.get("/groups", headers=auth).json() == []
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_groups.py -v`
Expected: FAIL — `ImportError: cannot import name 'generate_invite_code'`

- [ ] **Step 3: 초대코드 생성기 작성**

`server/app/domain.py`에 추가한다:

```python
import random

# 손으로 옮겨 적는 코드라 헷갈리는 글자(O/0, I/1)를 뺀다
INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVITE_LENGTH = 6


def generate_invite_code(rng: random.Random | None = None) -> str:
    source = rng or random.SystemRandom()
    return "".join(source.choice(INVITE_ALPHABET) for _ in range(INVITE_LENGTH))
```

- [ ] **Step 4: 스키마와 라우터 작성**

`server/app/schemas.py`에 추가한다:

```python
class GroupCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class GroupJoinIn(BaseModel):
    invite_code: str = Field(min_length=6, max_length=6)


class GroupOut(BaseModel):
    id: str
    name: str
    invite_code: str

    model_config = {"from_attributes": True}
```

`server/app/routers/groups.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.domain import generate_invite_code
from app.models import Group, Membership, User
from app.schemas import GroupCreateIn, GroupJoinIn, GroupOut
from app.security import get_current_user

router = APIRouter(prefix="/groups", tags=["groups"])


def _ensure_membership(db: Session, user_id: str, group_id: str) -> None:
    exists = db.query(Membership).filter_by(user_id=user_id, group_id=group_id).count()
    if not exists:
        db.add(Membership(user_id=user_id, group_id=group_id))


@router.post("", response_model=GroupOut)
def create_group(
    body: GroupCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Group:
    for _ in range(10):
        code = generate_invite_code()
        if not db.query(Group).filter_by(invite_code=code).count():
            break
    else:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "초대코드 생성에 실패했습니다")

    group = Group(name=body.name, invite_code=code, owner_id=user.id)
    db.add(group)
    db.flush()
    _ensure_membership(db, user.id, group.id)
    db.commit()
    return group


@router.post("/join", response_model=GroupOut)
def join_group(
    body: GroupJoinIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Group:
    group = db.query(Group).filter_by(invite_code=body.invite_code.upper()).one_or_none()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "없는 초대코드입니다")

    _ensure_membership(db, user.id, group.id)
    db.commit()
    return group


@router.get("", response_model=list[GroupOut])
def my_groups(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Group]:
    return (db.query(Group)
              .join(Membership, Membership.group_id == Group.id)
              .filter(Membership.user_id == user.id)
              .all())
```

`server/app/main.py`에 `app.include_router(groups.router)`를 추가한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_groups.py -v`
Expected: PASS (7 passed)

- [ ] **Step 6: 커밋**

```bash
git add server/app/routers/groups.py server/app/domain.py server/app/schemas.py server/app/main.py server/tests/test_groups.py
git commit -m "feat(server): 그룹 생성과 초대코드 참여"
```

---

## Task 13: 그룹 피드

사진은 그룹원에게 전부 공개된다. pHash·EXIF 자동 차단을 v1에서 뺐으므로
상호 감시가 그 자리를 메운다(스펙 §4.6). 사진은 만료 있는 presigned URL로 내보낸다.

**Files:**
- Create: `server/app/routers/feed.py`
- Modify: `server/app/storage.py` (`url()` 추가), `server/app/schemas.py`, `server/app/main.py`
- Test: `server/tests/test_feed.py`

**Interfaces:**
- Consumes: `Membership`, `StudySession`, `Photo`, `DailyRecord`, `day_bounds`, `study_day`
- Produces:
  - `PhotoStorage.url(key: str) -> str` — 조회용 URL (S3는 presigned GET, 만료 1시간)
  - `GET /groups/{group_id}/feed?date=YYYY-MM-DD` → `list[FeedItemOut]`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_feed.py`:

```python
from datetime import timedelta

from app.models import DailyRecord, Membership, StudySession, User
from app.time_utils import now_utc, study_day


def join_friend(client, monkeypatch, code, nickname="친구"):
    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: f"apple-{nickname}")
    token = client.post("/auth/social", json={
        "provider": "apple", "id_token": nickname, "nickname": nickname,
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/groups/join", headers=headers, json={"invite_code": code})
    return headers


def test_feed_lists_every_member(client, auth, jpeg, db, monkeypatch):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    join_friend(client, monkeypatch, group["invite_code"])

    feed = client.get(f"/groups/{group['id']}/feed", headers=auth).json()
    assert {item["nickname"] for item in feed} == {"광휘", "친구"}
    assert all(item["total_minutes"] == 0 for item in feed)
    assert all(item["result"] is None for item in feed)


def test_closed_sessions_show_up_with_photos(client, auth, jpeg, db):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    session_id = client.post("/sessions/start", headers=auth,
                             files={"image": ("s.jpg", jpeg, "image/jpeg")}
                             ).json()["session"]["id"]
    session = db.get(StudySession, session_id)
    session.started_at = session.started_at - timedelta(minutes=50)
    db.commit()
    client.post(f"/sessions/{session_id}/end", headers=auth,
                files={"image": ("e.jpg", jpeg, "image/jpeg")})

    item = client.get(f"/groups/{group['id']}/feed", headers=auth).json()[0]
    assert item["total_minutes"] == 50
    assert {p["kind"] for p in item["photos"]} == {"start", "end"}
    assert all(p["url"] for p in item["photos"])


def test_open_sessions_are_not_counted_yet(client, auth, jpeg, db):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    client.post("/sessions/start", headers=auth,
                files={"image": ("s.jpg", jpeg, "image/jpeg")})

    item = client.get(f"/groups/{group['id']}/feed", headers=auth).json()[0]
    assert item["total_minutes"] == 0


def test_settled_result_is_shown(client, auth, db):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    user = db.query(User).one()
    db.add(DailyRecord(user_id=user.id, date=study_day(now_utc()),
                       total_minutes=0, goal_minutes=60, result="failed",
                       streak_snapshot=0, settled_at=now_utc()))
    db.commit()

    item = client.get(f"/groups/{group['id']}/feed", headers=auth).json()[0]
    assert item["result"] == "failed"


def test_non_members_cannot_read_the_feed(client, auth, db, monkeypatch):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: "apple-stranger")
    outsider = {"Authorization": "Bearer " + client.post("/auth/social", json={
        "provider": "apple", "id_token": "s", "nickname": "남",
    }).json()["access_token"]}

    assert client.get(f"/groups/{group['id']}/feed", headers=outsider).status_code == 403


def test_failed_photos_are_hidden_from_the_feed(client, auth, jpeg, db, judge):
    from app.judge.base import Verdict
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    client.post("/sessions/start", headers=auth,
                files={"image": ("s.jpg", jpeg, "image/jpeg")})

    item = client.get(f"/groups/{group['id']}/feed", headers=auth).json()[0]
    assert item["photos"] == []
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_feed.py -v`
Expected: FAIL — 404 (엔드포인트 없음)

- [ ] **Step 3: 스토리지에 조회 URL 추가**

`server/app/storage.py`를 수정한다. `PhotoStorage` Protocol에 `url`을 추가하고,

```python
class PhotoStorage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes: ...

    def url(self, key: str) -> str: ...
```

`S3Storage`에:

```python
    def url(self, key: str) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=3600,
        )
```

`MemoryStorage`에:

```python
    def url(self, key: str) -> str:
        return f"memory://{key}"
```

- [ ] **Step 4: 스키마와 라우터 작성**

`server/app/schemas.py`에 추가한다:

```python
class FeedPhotoOut(BaseModel):
    kind: str
    url: str
    received_at: datetime


class FeedItemOut(BaseModel):
    user_id: str
    nickname: str
    streak_count: int
    total_minutes: int
    goal_minutes: int
    result: str | None
    photos: list[FeedPhotoOut]
```

`server/app/routers/feed.py`:

```python
from datetime import date as Date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DailyRecord, Membership, Photo, StudySession, User
from app.schemas import FeedItemOut, FeedPhotoOut
from app.security import get_current_user
from app.storage import PhotoStorage, get_storage
from app.time_utils import day_bounds, now_utc, study_day

router = APIRouter(tags=["feed"])


@router.get("/groups/{group_id}/feed", response_model=list[FeedItemOut])
def group_feed(
    group_id: str,
    date: Date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
) -> list[FeedItemOut]:
    if not db.query(Membership).filter_by(user_id=user.id, group_id=group_id).count():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "그룹원만 볼 수 있습니다")

    day = date or study_day(now_utc())
    start, end = day_bounds(day)

    members = (db.query(User)
                 .join(Membership, Membership.user_id == User.id)
                 .filter(Membership.group_id == group_id)
                 .all())
    member_ids = [m.id for m in members]

    sessions = (db.query(StudySession)
                  .filter(StudySession.user_id.in_(member_ids),
                          StudySession.status == "closed",
                          StudySession.started_at >= start,
                          StudySession.started_at < end)
                  .all())
    records = {r.user_id: r for r in db.query(DailyRecord)
               .filter(DailyRecord.user_id.in_(member_ids), DailyRecord.date == day)}

    photos = (db.query(Photo)
                .filter(Photo.user_id.in_(member_ids),
                        Photo.status == "pass",
                        Photo.received_at >= start,
                        Photo.received_at < end)
                .order_by(Photo.received_at)
                .all())

    items: list[FeedItemOut] = []
    for member in members:
        record = records.get(member.id)
        items.append(FeedItemOut(
            user_id=member.id,
            nickname=member.nickname,
            streak_count=member.streak_count,
            total_minutes=sum(s.counted_minutes for s in sessions
                              if s.user_id == member.id),
            goal_minutes=record.goal_minutes if record else member.daily_goal_minutes,
            result=record.result if record else None,
            photos=[FeedPhotoOut(kind=p.kind, url=storage.url(p.s3_key),
                                 received_at=p.received_at)
                    for p in photos if p.user_id == member.id],
        ))
    return items
```

`server/app/main.py`에 `app.include_router(feed.router)`를 추가한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_feed.py -v`
Expected: PASS (6 passed)

- [ ] **Step 6: 커밋**

```bash
git add server/app/routers/feed.py server/app/storage.py server/app/schemas.py server/app/main.py server/tests/test_feed.py
git commit -m "feat(server): 그룹 피드와 사진 조회 URL"
```

---

## Task 14: RevenueCat 웹훅으로 패스권 지급

클라이언트가 "샀다"고 말하는 것은 신뢰하지 않는다. 지급은 웹훅으로만 일어난다.

**Files:**
- Create: `server/app/routers/webhooks.py`
- Modify: `server/app/domain.py`, `server/app/main.py`
- Test: `server/tests/test_webhooks.py`

**Interfaces:**
- Consumes: `Purchase`, `User`, `settings.revenuecat_webhook_secret`
- Produces:
  - `app.domain.TICKETS_BY_PRODUCT: dict[str, int]`
  - `POST /webhooks/revenuecat` → `{"granted": int}`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_webhooks.py`:

```python
from app.config import settings
from app.models import Purchase, User

HEADERS = {"Authorization": f"Bearer {settings.revenuecat_webhook_secret}"}


def event(user_id, event_id="evt-1", product_id="pass_3",
          type_="NON_RENEWING_PURCHASE"):
    return {"event": {"id": event_id, "type": type_,
                      "app_user_id": user_id, "product_id": product_id}}


def test_purchase_grants_tickets(client, auth, db):
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat", headers=HEADERS, json=event(user.id))

    assert r.status_code == 200 and r.json()["granted"] == 3
    db.refresh(user)
    assert user.pass_tickets == 3
    assert db.query(Purchase).count() == 1


def test_ten_pack_grants_ten(client, auth, db):
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS,
                json=event(user.id, product_id="pass_10"))
    db.refresh(user)
    assert user.pass_tickets == 10


def test_replayed_event_grants_nothing_extra(client, auth, db):
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=event(user.id))
    r = client.post("/webhooks/revenuecat", headers=HEADERS, json=event(user.id))

    assert r.json()["granted"] == 0
    db.refresh(user)
    assert user.pass_tickets == 3
    assert db.query(Purchase).count() == 1


def test_wrong_secret_is_rejected(client, auth, db):
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat",
                    headers={"Authorization": "Bearer nope"}, json=event(user.id))
    assert r.status_code == 401
    db.refresh(user)
    assert user.pass_tickets == 0


def test_unrelated_event_types_are_ignored(client, auth, db):
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat", headers=HEADERS,
                    json=event(user.id, type_="TEST"))
    assert r.status_code == 200 and r.json()["granted"] == 0
    db.refresh(user)
    assert user.pass_tickets == 0


def test_unknown_product_grants_nothing(client, auth, db):
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat", headers=HEADERS,
                    json=event(user.id, product_id="pass_999"))
    assert r.json()["granted"] == 0


def test_unknown_user_is_ignored(client, auth):
    r = client.post("/webhooks/revenuecat", headers=HEADERS, json=event("no-such-user"))
    assert r.status_code == 200 and r.json()["granted"] == 0
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_webhooks.py -v`
Expected: FAIL — 404 (엔드포인트 없음)

- [ ] **Step 3: SKU 매핑 추가**

`server/app/domain.py`에 추가한다:

```python
# 스펙 §4.5. 패스권은 한 종류이고 묶음 크기만 다르다
TICKETS_BY_PRODUCT = {"pass_3": 3, "pass_10": 10}
GRANTING_EVENT_TYPES = {"INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"}
```

- [ ] **Step 4: 라우터 작성**

`server/app/routers/webhooks.py`:

```python
import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.domain import GRANTING_EVENT_TYPES, TICKETS_BY_PRODUCT
from app.models import Purchase, User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])


@router.post("/webhooks/revenuecat")
def revenuecat(
    payload: dict,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    expected = f"Bearer {settings.revenuecat_webhook_secret}"
    if not hmac.compare_digest(authorization, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid webhook secret")

    event = payload.get("event", {})
    if event.get("type") not in GRANTING_EVENT_TYPES:
        return {"granted": 0}

    tickets = TICKETS_BY_PRODUCT.get(event.get("product_id"))
    if tickets is None:
        logger.warning("알 수 없는 상품: %s", event.get("product_id"))
        return {"granted": 0}

    event_id = str(event.get("id"))
    if db.query(Purchase).filter_by(revenuecat_event_id=event_id).count():
        return {"granted": 0}          # 웹훅은 재전송된다. 멱등이어야 한다

    user = db.get(User, str(event.get("app_user_id")))
    if user is None:
        logger.warning("알 수 없는 유저의 구매 이벤트: %s", event.get("app_user_id"))
        return {"granted": 0}

    user.pass_tickets += tickets
    db.add(Purchase(user_id=user.id, revenuecat_event_id=event_id,
                    product_id=event["product_id"], tickets_granted=tickets))
    db.commit()
    return {"granted": tickets}
```

`server/app/main.py`에 `app.include_router(webhooks.router)`를 추가한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_webhooks.py -v`
Expected: PASS (7 passed)

- [ ] **Step 6: 커밋**

```bash
git add server/app/routers/webhooks.py server/app/domain.py server/app/main.py server/tests/test_webhooks.py
git commit -m "feat(server): RevenueCat 웹훅으로 패스권 지급"
```

---

## Task 15: 04:00 정산 배치

**돈과 streak가 걸린 로직이다.** 판정 규칙을 순수 함수로 먼저 고정하고,
DB를 만지는 배치는 그 위에 얇게 얹는다.

**Files:**
- Create: `server/app/batch/__init__.py`, `server/app/batch/settlement.py`
- Modify: `server/app/domain.py`
- Test: `server/tests/test_settlement_rules.py`, `server/tests/test_settlement.py`

**Interfaces:**
- Consumes: `day_bounds`, `StudySession`, `DailyRecord`, `User`
- Produces:
  - `app.domain.Outcome(result: str, tickets_used: int, new_streak: int)` — frozen dataclass
  - `app.domain.settle_outcome(total: int, goal: int, tickets: int, streak: int, defense_cost: int) -> Outcome`
  - `app.batch.settlement.settle_day(db: Session, day: date) -> int` — 만든 레코드 수

- [ ] **Step 1: 순수 규칙 테스트 작성**

`server/tests/test_settlement_rules.py`:

```python
from app.domain import settle_outcome


def test_meeting_the_goal_increases_streak():
    out = settle_outcome(total=70, goal=60, tickets=0, streak=4, defense_cost=1)
    assert out == ("success", 0, 5)


def test_exactly_the_goal_counts_as_success():
    assert settle_outcome(total=60, goal=60, tickets=0, streak=0, defense_cost=1).result == "success"


def test_shortfall_with_a_ticket_holds_the_streak():
    out = settle_outcome(total=10, goal=60, tickets=3, streak=7, defense_cost=1)
    assert out.result == "passed"
    assert out.tickets_used == 1
    assert out.new_streak == 7          # 유지될 뿐 늘지 않는다


def test_shortfall_without_a_ticket_breaks_the_streak():
    out = settle_outcome(total=10, goal=60, tickets=0, streak=7, defense_cost=1)
    assert out == ("failed", 0, 0)


def test_zero_minutes_is_a_shortfall():
    assert settle_outcome(total=0, goal=60, tickets=0, streak=1, defense_cost=1).result == "failed"
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_settlement_rules.py -v`
Expected: FAIL — `ImportError: cannot import name 'settle_outcome'`

- [ ] **Step 3: 정산 규칙 작성**

`server/app/domain.py`에 추가한다:

```python
from typing import NamedTuple


class Outcome(NamedTuple):
    result: str          # success | passed | failed
    tickets_used: int
    new_streak: int


def settle_outcome(total: int, goal: int, tickets: int,
                   streak: int, defense_cost: int) -> Outcome:
    """하루치 결과를 정한다. 스펙 §4.3."""
    if total >= goal:
        return Outcome("success", 0, streak + 1)
    if tickets >= defense_cost:
        return Outcome("passed", defense_cost, streak)
    return Outcome("failed", 0, 0)
```

- [ ] **Step 4: 배치 테스트 작성**

`server/tests/test_settlement.py`:

```python
from datetime import timedelta

import pytest

from app.batch.settlement import settle_day
from app.models import DailyRecord, Photo, StudySession, User
from app.time_utils import day_bounds, now_utc, study_day


@pytest.fixture()
def user(db):
    u = User(provider="apple", provider_sub="s", nickname="광휘",
             daily_goal_minutes=60, streak_count=3, pass_tickets=0)
    db.add(u)
    db.commit()
    return u


def add_session(db, user, day, minutes, status="closed"):
    start, _ = day_bounds(day)
    at = start + timedelta(hours=5)
    photo = Photo(user_id=user.id, kind="start", s3_key="k", received_at=at, status="pass")
    db.add(photo)
    db.flush()
    db.add(StudySession(user_id=user.id, start_photo_id=photo.id, started_at=at,
                        ended_at=at + timedelta(minutes=minutes),
                        counted_minutes=minutes, status=status))
    db.commit()


def test_meeting_the_goal_records_success(db, user):
    day = study_day(now_utc()) - timedelta(days=1)
    add_session(db, user, day, 40)
    add_session(db, user, day, 25)      # 합산 65분

    assert settle_day(db, day) == 1
    record = db.query(DailyRecord).one()
    assert record.total_minutes == 65
    assert record.result == "success"
    assert record.goal_minutes == 60
    db.refresh(user)
    assert user.streak_count == 4
    assert record.streak_snapshot == 4


def test_shortfall_consumes_one_ticket(db, user):
    user.pass_tickets = 2
    db.commit()
    day = study_day(now_utc()) - timedelta(days=1)
    add_session(db, user, day, 10)

    settle_day(db, day)
    db.refresh(user)
    assert user.pass_tickets == 1
    assert user.streak_count == 3
    assert db.query(DailyRecord).one().result == "passed"


def test_shortfall_without_tickets_breaks_the_streak(db, user):
    day = study_day(now_utc()) - timedelta(days=1)
    add_session(db, user, day, 10)

    settle_day(db, day)
    db.refresh(user)
    assert user.streak_count == 0
    record = db.query(DailyRecord).one()
    assert record.result == "failed"
    assert record.streak_snapshot == 0


def test_abandoned_sessions_contribute_nothing(db, user):
    day = study_day(now_utc()) - timedelta(days=1)
    add_session(db, user, day, 0, status="abandoned")

    settle_day(db, day)
    assert db.query(DailyRecord).one().total_minutes == 0


def test_other_days_are_not_counted(db, user):
    day = study_day(now_utc()) - timedelta(days=1)
    add_session(db, user, day - timedelta(days=1), 200)

    settle_day(db, day)
    assert db.query(DailyRecord).one().total_minutes == 0


def test_pending_goal_is_promoted_after_settling(db, user):
    user.pending_goal_minutes = 120
    db.commit()
    day = study_day(now_utc()) - timedelta(days=1)
    add_session(db, user, day, 70)

    settle_day(db, day)
    db.refresh(user)
    assert db.query(DailyRecord).one().goal_minutes == 60   # 오늘은 옛 목표로 판정
    assert user.daily_goal_minutes == 120                   # 내일부터 새 목표
    assert user.pending_goal_minutes is None


def test_running_twice_does_not_double_settle(db, user):
    day = study_day(now_utc()) - timedelta(days=1)
    add_session(db, user, day, 70)

    assert settle_day(db, day) == 1
    assert settle_day(db, day) == 0
    db.refresh(user)
    assert user.streak_count == 4
    assert db.query(DailyRecord).count() == 1
```

- [ ] **Step 5: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_settlement.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.batch'`

- [ ] **Step 6: 배치 구현**

`server/app/batch/settlement.py`:

```python
import logging
from datetime import date as Date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.domain import settle_outcome
from app.models import DailyRecord, StudySession, User
from app.time_utils import day_bounds, now_utc

logger = logging.getLogger(__name__)


def settle_day(db: Session, day: Date) -> int:
    """day의 daily_record를 유저마다 하나씩 만든다. 이미 있으면 건너뛴다.

    그룹과 무관하다 — 목표·streak·패스권이 전부 유저 단위이기 때문이다.
    """
    start, end = day_bounds(day)

    minutes = dict(
        db.query(StudySession.user_id, func.sum(StudySession.counted_minutes))
          .filter(StudySession.status == "closed",
                  StudySession.started_at >= start,
                  StudySession.started_at < end)
          .group_by(StudySession.user_id)
          .all()
    )
    already = {row[0] for row in
               db.query(DailyRecord.user_id).filter(DailyRecord.date == day)}

    created = 0
    for user in db.query(User).all():
        if user.id in already:
            continue

        total = int(minutes.get(user.id) or 0)
        outcome = settle_outcome(
            total=total, goal=user.daily_goal_minutes,
            tickets=user.pass_tickets, streak=user.streak_count,
            defense_cost=settings.tickets_for_defense,
        )
        user.pass_tickets -= outcome.tickets_used
        user.streak_count = outcome.new_streak

        db.add(DailyRecord(
            user_id=user.id, date=day, total_minutes=total,
            goal_minutes=user.daily_goal_minutes, result=outcome.result,
            pass_tickets_used=outcome.tickets_used,
            streak_snapshot=outcome.new_streak, settled_at=now_utc(),
        ))

        if user.pending_goal_minutes is not None:
            user.daily_goal_minutes = user.pending_goal_minutes
            user.pending_goal_minutes = None

        created += 1

    db.commit()
    logger.info("정산 완료 day=%s records=%d", day, created)
    return created
```

`server/app/batch/__init__.py`는 빈 파일이다.

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_settlement_rules.py tests/test_settlement.py -v`
Expected: PASS (12 passed)

- [ ] **Step 8: 커밋**

```bash
git add server/app/batch server/app/domain.py server/tests/test_settlement*.py
git commit -m "feat(server): 04:00 정산 배치와 목표 승격"
```

---

## Task 16: streak 복구

결정 14가 말한 핵심 매출 지점이다. 복구는 패스권 **2개**를 쓰고, 정산 후 **24시간** 안에만 된다.

**Files:**
- Create: `server/app/routers/records.py`
- Modify: `server/app/schemas.py`, `server/app/main.py`
- Test: `server/tests/test_restore.py`

**Interfaces:**
- Consumes: `DailyRecord`, `User`, `settings.tickets_for_restore`, `settings.restore_window_hours`
- Produces:
  - `GET /records/me?limit=30` → `list[DailyRecordOut]`
  - `POST /records/{record_id}/restore` → `DailyRecordOut`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_restore.py`:

```python
from datetime import timedelta

import pytest

from app.models import DailyRecord, User
from app.time_utils import now_utc, study_day


@pytest.fixture()
def failed_record(client, auth, db):
    """어제 failed. 그저께는 streak 6에서 끝나 있었다."""
    user = db.query(User).one()
    user.streak_count = 0
    user.pass_tickets = 2
    yesterday = study_day(now_utc()) - timedelta(days=1)

    db.add(DailyRecord(user_id=user.id, date=yesterday - timedelta(days=1),
                       total_minutes=90, goal_minutes=60, result="success",
                       streak_snapshot=6, settled_at=now_utc() - timedelta(days=1)))
    record = DailyRecord(user_id=user.id, date=yesterday, total_minutes=10,
                         goal_minutes=60, result="failed", streak_snapshot=0,
                         settled_at=now_utc() - timedelta(hours=2))
    db.add(record)
    db.commit()
    return record


def test_restore_costs_two_tickets_and_rebuilds_the_streak(client, auth, db, failed_record):
    r = client.post(f"/records/{failed_record.id}/restore", headers=auth)
    assert r.status_code == 200
    assert r.json()["result"] == "passed"
    assert r.json()["pass_tickets_used"] == 2

    user = db.query(User).one()
    db.refresh(user)
    assert user.pass_tickets == 0
    assert user.streak_count == 7        # 전날 스냅샷 6 + 1


def test_restore_needs_two_tickets(client, auth, db, failed_record):
    user = db.query(User).one()
    user.pass_tickets = 1
    db.commit()

    r = client.post(f"/records/{failed_record.id}/restore", headers=auth)
    assert r.status_code == 402
    db.refresh(user)
    assert user.pass_tickets == 1


def test_restore_expires_after_24_hours(client, auth, db, failed_record):
    failed_record.settled_at = now_utc() - timedelta(hours=25)
    db.commit()

    assert client.post(f"/records/{failed_record.id}/restore", headers=auth).status_code == 409


def test_only_failed_records_can_be_restored(client, auth, db, failed_record):
    failed_record.result = "success"
    db.commit()

    assert client.post(f"/records/{failed_record.id}/restore", headers=auth).status_code == 409


def test_cannot_restore_twice(client, auth, db, failed_record):
    user = db.query(User).one()
    user.pass_tickets = 4
    db.commit()

    client.post(f"/records/{failed_record.id}/restore", headers=auth)
    assert client.post(f"/records/{failed_record.id}/restore", headers=auth).status_code == 409


def test_streak_becomes_one_when_there_is_no_previous_day(client, auth, db, failed_record):
    db.query(DailyRecord).filter(DailyRecord.date < failed_record.date).delete()
    db.commit()

    client.post(f"/records/{failed_record.id}/restore", headers=auth)
    db.refresh(db.query(User).one())
    assert db.query(User).one().streak_count == 1


def test_cannot_restore_someone_elses_record(client, auth, db, failed_record, monkeypatch):
    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: "apple-other")
    other = {"Authorization": "Bearer " + client.post("/auth/social", json={
        "provider": "apple", "id_token": "o", "nickname": "남",
    }).json()["access_token"]}

    assert client.post(f"/records/{failed_record.id}/restore", headers=other).status_code == 404
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_restore.py -v`
Expected: FAIL — 404 (엔드포인트 없음)

- [ ] **Step 3: 스키마 추가**

`server/app/schemas.py`에 추가한다:

```python
from datetime import date as Date


class DailyRecordOut(BaseModel):
    id: str
    date: Date
    total_minutes: int
    goal_minutes: int
    result: str
    pass_tickets_used: int
    streak_snapshot: int
    settled_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: 라우터 작성**

`server/app/routers/records.py`:

```python
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import DailyRecord, User
from app.schemas import DailyRecordOut
from app.security import get_current_user
from app.time_utils import now_utc

router = APIRouter(prefix="/records", tags=["records"])


@router.get("/me", response_model=list[DailyRecordOut])
def my_records(
    limit: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DailyRecord]:
    return (db.query(DailyRecord).filter_by(user_id=user.id)
              .order_by(DailyRecord.date.desc()).limit(limit).all())


@router.post("/{record_id}/restore", response_model=DailyRecordOut)
def restore_streak(
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DailyRecord:
    """끊긴 streak를 되산다. 패스권 2개, 정산 후 24시간 이내."""
    record = (db.query(DailyRecord)
                .filter_by(id=record_id, user_id=user.id).one_or_none())
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "기록을 찾을 수 없습니다")
    if record.result != "failed":
        raise HTTPException(status.HTTP_409_CONFLICT, "실패한 날만 복구할 수 있습니다")

    deadline = record.settled_at + timedelta(hours=settings.restore_window_hours)
    if now_utc() > deadline:
        raise HTTPException(status.HTTP_409_CONFLICT, "복구 가능 시간이 지났습니다")

    cost = settings.tickets_for_restore
    if user.pass_tickets < cost:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED,
                            f"패스권 {cost}개가 필요합니다")

    previous = (db.query(DailyRecord)
                  .filter(DailyRecord.user_id == user.id,
                          DailyRecord.date < record.date)
                  .order_by(DailyRecord.date.desc()).first())

    user.pass_tickets -= cost
    user.streak_count = (previous.streak_snapshot if previous else 0) + 1
    record.result = "passed"
    record.pass_tickets_used = cost
    record.streak_snapshot = user.streak_count
    db.commit()
    return record
```

`server/app/main.py`에 `app.include_router(records.router)`를 추가한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_restore.py -v`
Expected: PASS (7 passed)

- [ ] **Step 6: 커밋**

```bash
git add server/app/routers/records.py server/app/schemas.py server/app/main.py server/tests/test_restore.py
git commit -m "feat(server): streak 복구 API"
```

---

## Task 17: 푸시 알림 채널

**Files:**
- Create: `server/app/notifications.py`
- Test: `server/tests/test_notifications.py`

**Interfaces:**
- Consumes: `settings.expo_push_url`, `User`
- Produces:
  - `Notification(token: str, title: str, body: str)` — frozen dataclass
  - `send_push(notifications: list[Notification]) -> int` — 실제 전송, 보낸 개수 반환
  - `app.notifications.sender` — 모듈 전역 훅. 배치는 이걸 통해 보내고, 테스트는 갈아끼운다

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_notifications.py`:

```python
import httpx
import pytest

from app.notifications import Notification, send_push


def test_no_notifications_sends_nothing(monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("호출되면 안 된다")

    monkeypatch.setattr(httpx, "post", explode)
    assert send_push([]) == 0


def test_messages_are_batched_into_one_request(monkeypatch):
    captured = {}

    class Resp:
        status_code = 200

        def raise_for_status(self):
            return None

    def fake_post(url, json, timeout):
        captured["url"] = url
        captured["json"] = json
        return Resp()

    monkeypatch.setattr(httpx, "post", fake_post)

    sent = send_push([
        Notification("ExponentPushToken[a]", "제목1", "본문1"),
        Notification("ExponentPushToken[b]", "제목2", "본문2"),
    ])

    assert sent == 2
    assert len(captured["json"]) == 2
    assert captured["json"][0] == {
        "to": "ExponentPushToken[a]", "title": "제목1", "body": "본문1",
    }


def test_transport_failure_does_not_raise(monkeypatch):
    def fake_post(url, json, timeout):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(httpx, "post", fake_post)
    assert send_push([Notification("t", "제목", "본문")]) == 0
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_notifications.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.notifications'`

- [ ] **Step 3: 구현**

`server/app/notifications.py`:

```python
import logging
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Notification:
    token: str
    title: str
    body: str


def send_push(notifications: list[Notification]) -> int:
    """Expo Push로 한 번에 보낸다. 실패해도 예외를 올리지 않는다.

    알림 전송 실패가 정산이나 세션 회수 배치를 중단시켜서는 안 된다.
    """
    if not notifications:
        return 0

    payload = [{"to": n.token, "title": n.title, "body": n.body}
               for n in notifications]
    try:
        response = httpx.post(settings.expo_push_url, json=payload, timeout=10.0)
        response.raise_for_status()
    except Exception as exc:
        logger.warning("푸시 전송 실패 (%d건): %r", len(payload), exc)
        return 0
    return len(payload)


# 배치는 이 훅을 통해 보낸다. 테스트에서 갈아끼우기 위한 것이다.
sender = send_push
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_notifications.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: 커밋**

```bash
git add server/app/notifications.py server/tests/test_notifications.py
git commit -m "feat(server): Expo 푸시 전송 채널"
```

---

## Task 18: 미종료 세션 경고와 회수

미종료 세션은 0분이다. 경고 없이 3시간 공부가 증발하면 그건 이탈 사고이므로,
회수 30분 전에 반드시 한 번 알린다. `warned_at`이 중복 발송을 막는다.

**Files:**
- Create: `server/app/batch/sessions.py`
- Test: `server/tests/test_stale_sessions.py`

**Interfaces:**
- Consumes: `StudySession`, `User`, `Notification`, `notifications.sender`, `settings.session_warn_minutes`, `settings.session_max_minutes`
- Produces:
  - `warn_stale_sessions(db: Session) -> int`
  - `abandon_expired_sessions(db: Session) -> int`
  - `sweep(db: Session) -> tuple[int, int]` — (경고 수, 회수 수)

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_stale_sessions.py`:

```python
from datetime import timedelta

import pytest

from app import notifications
from app.batch.sessions import abandon_expired_sessions, sweep, warn_stale_sessions
from app.models import Photo, StudySession, User
from app.time_utils import now_utc


@pytest.fixture()
def sent(monkeypatch):
    box = []
    monkeypatch.setattr(notifications, "sender", lambda items: box.extend(items) or len(items))
    return box


@pytest.fixture()
def user(db):
    u = User(provider="apple", provider_sub="s", nickname="광휘",
             expo_push_token="ExponentPushToken[x]")
    db.add(u)
    db.commit()
    return u


def open_session(db, user, age_minutes):
    at = now_utc() - timedelta(minutes=age_minutes)
    photo = Photo(user_id=user.id, kind="start", s3_key="k", received_at=at, status="pass")
    db.add(photo)
    db.flush()
    session = StudySession(user_id=user.id, start_photo_id=photo.id,
                           started_at=at, status="open")
    db.add(session)
    db.commit()
    return session


def test_young_sessions_are_left_alone(db, user, sent):
    session = open_session(db, user, 100)
    assert sweep(db) == (0, 0)
    db.refresh(session)
    assert session.status == "open" and session.warned_at is None
    assert sent == []


def test_session_past_warn_threshold_is_warned_once(db, user, sent):
    session = open_session(db, user, 215)      # 3시간 35분

    assert warn_stale_sessions(db) == 1
    db.refresh(session)
    assert session.warned_at is not None
    assert session.status == "open"
    assert len(sent) == 1
    assert "30분" in sent[0].body

    assert warn_stale_sessions(db) == 0        # 두 번 보내지 않는다
    assert len(sent) == 1


def test_session_past_four_hours_is_abandoned_with_zero_minutes(db, user, sent):
    session = open_session(db, user, 245)

    assert abandon_expired_sessions(db) == 1
    db.refresh(session)
    assert session.status == "abandoned"
    assert session.counted_minutes == 0
    assert session.ended_at is None


def test_closed_sessions_are_never_touched(db, user, sent):
    session = open_session(db, user, 300)
    session.status = "closed"
    session.counted_minutes = 240
    db.commit()

    assert sweep(db) == (0, 0)
    db.refresh(session)
    assert session.counted_minutes == 240


def test_users_without_a_push_token_are_still_warned_in_db(db, user, sent):
    user.expo_push_token = None
    db.commit()
    session = open_session(db, user, 215)

    assert warn_stale_sessions(db) == 1
    db.refresh(session)
    assert session.warned_at is not None
    assert sent == []
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_stale_sessions.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.batch.sessions'`

- [ ] **Step 3: 구현**

`server/app/batch/sessions.py`:

```python
import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from app import notifications
from app.config import settings
from app.models import StudySession, User
from app.notifications import Notification
from app.time_utils import now_utc

logger = logging.getLogger(__name__)


def warn_stale_sessions(db: Session) -> int:
    """회수 30분 전에 한 번만 알린다."""
    now = now_utc()
    warn_before = now - timedelta(minutes=settings.session_warn_minutes)
    expire_before = now - timedelta(minutes=settings.session_max_minutes)

    sessions = (db.query(StudySession)
                  .filter(StudySession.status == "open",
                          StudySession.warned_at.is_(None),
                          StudySession.started_at <= warn_before,
                          StudySession.started_at > expire_before)
                  .all())
    if not sessions:
        return 0

    remaining = settings.session_max_minutes - settings.session_warn_minutes
    tokens = dict(db.query(User.id, User.expo_push_token)
                    .filter(User.id.in_([s.user_id for s in sessions])))

    pushes = []
    for session in sessions:
        session.warned_at = now
        token = tokens.get(session.user_id)
        if token:
            pushes.append(Notification(
                token=token,
                title="공부 세션이 곧 폐기됩니다",
                body=f"{remaining}분 안에 종료 샷을 찍지 않으면 이 세션은 0분으로 처리됩니다.",
            ))

    db.commit()
    notifications.sender(pushes)
    return len(sessions)


def abandon_expired_sessions(db: Session) -> int:
    """4시간이 지나도 종료 샷이 없으면 0분으로 회수한다."""
    expire_before = now_utc() - timedelta(minutes=settings.session_max_minutes)
    sessions = (db.query(StudySession)
                  .filter(StudySession.status == "open",
                          StudySession.started_at <= expire_before)
                  .all())
    for session in sessions:
        session.status = "abandoned"
        session.counted_minutes = 0
    db.commit()
    if sessions:
        logger.info("미종료 세션 회수 %d건", len(sessions))
    return len(sessions)


def sweep(db: Session) -> tuple[int, int]:
    return warn_stale_sessions(db), abandon_expired_sessions(db)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_stale_sessions.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: 커밋**

```bash
git add server/app/batch/sessions.py server/tests/test_stale_sessions.py
git commit -m "feat(server): 미종료 세션 경고와 0분 회수"
```

---

## Task 19: 마감 리마인드 · 복구 유도 · fail 즉시 알림

스펙 §5의 나머지 세 알림이다. 리마인드는 **미달자에게만**, 복구 유도는
**어제 failed인 사람에게만** 보낸다. 달성한 사람에게 보내면 그건 스팸이다.

**Files:**
- Create: `server/app/batch/reminders.py`
- Modify: `server/app/routers/sessions.py`
- Test: `server/tests/test_reminders.py`

**Interfaces:**
- Consumes: `DailyRecord`, `StudySession`, `User`, `day_bounds`, `study_day`, `notifications.sender`
- Produces:
  - `remind_shortfall(db: Session) -> int` — 22:00 cron
  - `nudge_restore(db: Session, day: date) -> int` — 08:00 cron
  - `app.routers.sessions.notify_rejection(user: User, reason: str) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_reminders.py`:

```python
from datetime import timedelta

import pytest

from app import notifications
from app.batch.reminders import nudge_restore, remind_shortfall
from app.models import DailyRecord, Photo, StudySession, User
from app.time_utils import day_bounds, now_utc, study_day


@pytest.fixture()
def sent(monkeypatch):
    box = []
    monkeypatch.setattr(notifications, "sender", lambda items: box.extend(items) or len(items))
    return box


def make_user(db, nickname, goal=60, token="ExponentPushToken[x]"):
    user = User(provider="apple", provider_sub=nickname, nickname=nickname,
                daily_goal_minutes=goal, expo_push_token=token)
    db.add(user)
    db.commit()
    return user


def add_closed_session(db, user, minutes):
    day = study_day(now_utc())
    start, _ = day_bounds(day)
    at = max(start, now_utc() - timedelta(minutes=minutes + 5))
    photo = Photo(user_id=user.id, kind="start", s3_key="k", received_at=at, status="pass")
    db.add(photo)
    db.flush()
    db.add(StudySession(user_id=user.id, start_photo_id=photo.id, started_at=at,
                        ended_at=at + timedelta(minutes=minutes),
                        counted_minutes=minutes, status="closed"))
    db.commit()


def test_reminds_only_those_short_of_goal(db, sent):
    behind = make_user(db, "뒤처짐")
    ahead = make_user(db, "달성")
    add_closed_session(db, behind, 20)
    add_closed_session(db, ahead, 90)

    assert remind_shortfall(db) == 1
    assert len(sent) == 1
    assert "40분" in sent[0].body        # 남은 분을 알려준다


def test_users_with_no_push_token_are_skipped(db, sent):
    make_user(db, "무토큰", token=None)
    assert remind_shortfall(db) == 0
    assert sent == []


def test_nudge_targets_yesterdays_failures_only(db, sent):
    failed = make_user(db, "실패")
    passed = make_user(db, "방어")
    yesterday = study_day(now_utc()) - timedelta(days=1)

    db.add(DailyRecord(user_id=failed.id, date=yesterday, total_minutes=0,
                       goal_minutes=60, result="failed", streak_snapshot=0,
                       settled_at=now_utc()))
    db.add(DailyRecord(user_id=passed.id, date=yesterday, total_minutes=0,
                       goal_minutes=60, result="passed", streak_snapshot=5,
                       settled_at=now_utc()))
    db.commit()

    assert nudge_restore(db, yesterday) == 1
    assert len(sent) == 1
    assert sent[0].token == failed.expo_push_token


def test_nudge_sends_nothing_when_nobody_failed(db, sent):
    make_user(db, "아무개")
    assert nudge_restore(db, study_day(now_utc()) - timedelta(days=1)) == 0
    assert sent == []


def test_rejection_push_is_sent_on_fail(client, auth, jpeg, db, judge, sent):
    from app.judge.base import Verdict
    db.query(User).one().expo_push_token = "ExponentPushToken[y]"
    db.commit()
    judge.verdict = Verdict("fail", 0.95, "게임 화면입니다.", {})

    client.post("/sessions/start", headers=auth,
                files={"image": ("s.jpg", jpeg, "image/jpeg")})

    assert len(sent) == 1
    assert sent[0].body == "게임 화면입니다."


def test_no_rejection_push_on_pass(client, auth, jpeg, db, sent):
    db.query(User).one().expo_push_token = "ExponentPushToken[y]"
    db.commit()
    client.post("/sessions/start", headers=auth,
                files={"image": ("s.jpg", jpeg, "image/jpeg")})
    assert sent == []
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_reminders.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.batch.reminders'`

- [ ] **Step 3: 배치 구현**

`server/app/batch/reminders.py`:

```python
import logging
from datetime import date as Date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import notifications
from app.models import DailyRecord, StudySession, User
from app.notifications import Notification
from app.time_utils import day_bounds, now_utc, study_day

logger = logging.getLogger(__name__)


def remind_shortfall(db: Session) -> int:
    """22:00 cron. 오늘 목표에 못 미친 사람에게만 보낸다."""
    day = study_day(now_utc())
    start, end = day_bounds(day)

    minutes = dict(
        db.query(StudySession.user_id, func.sum(StudySession.counted_minutes))
          .filter(StudySession.status == "closed",
                  StudySession.started_at >= start,
                  StudySession.started_at < end)
          .group_by(StudySession.user_id)
          .all()
    )

    pushes = []
    for user in db.query(User).filter(User.expo_push_token.isnot(None)):
        done = int(minutes.get(user.id) or 0)
        if done >= user.daily_goal_minutes:
            continue
        pushes.append(Notification(
            token=user.expo_push_token,
            title="오늘 목표까지 조금 남았어요",
            body=f"{user.daily_goal_minutes - done}분 더 하면 오늘 인증이 완성됩니다.",
        ))

    notifications.sender(pushes)
    logger.info("마감 리마인드 %d건", len(pushes))
    return len(pushes)


def nudge_restore(db: Session, day: Date) -> int:
    """08:00 cron. 어제 streak가 끊긴 사람에게만 복구를 권한다."""
    rows = (db.query(User, DailyRecord)
              .join(DailyRecord, DailyRecord.user_id == User.id)
              .filter(DailyRecord.date == day,
                      DailyRecord.result == "failed",
                      User.expo_push_token.isnot(None))
              .all())

    pushes = [
        Notification(
            token=user.expo_push_token,
            title="연속 기록이 끊겼어요",
            body="오늘 안에 패스권으로 어제 기록을 되살릴 수 있습니다.",
        )
        for user, _ in rows
    ]
    notifications.sender(pushes)
    logger.info("복구 유도 %d건", len(pushes))
    return len(pushes)
```

- [ ] **Step 4: fail 즉시 알림 연결**

`server/app/routers/sessions.py`에 추가한다:

```python
from app import notifications
from app.notifications import Notification


def notify_rejection(user: User, reason: str) -> None:
    """앱을 닫은 사이에 거절되면 세션이 통째로 날아간다. 즉시 알린다."""
    if user.expo_push_token:
        notifications.sender([Notification(
            token=user.expo_push_token, title="인증이 거절됐습니다", body=reason,
        )])
```

`start_session`과 `end_session`의 `db.commit()` 뒤, `return` 앞에 넣는다:

```python
    reason = _last_reason(db, photo.id)
    if not ok:
        notify_rejection(user, reason)
```

그리고 두 핸들러의 `JudgeResultOut(...)`에서 `reason=_last_reason(db, photo.id)`를
`reason=reason`으로 바꾼다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_reminders.py tests/test_session_start.py tests/test_session_end.py -v`
Expected: PASS (18 passed)

- [ ] **Step 6: 커밋**

```bash
git add server/app/batch/reminders.py server/app/routers/sessions.py server/tests/test_reminders.py
git commit -m "feat(server): 마감 리마인드·복구 유도·거절 즉시 알림"
```

---

## Task 20: 배치 CLI와 배포

**Files:**
- Create: `server/app/cli.py`, `server/deploy/crontab`, `server/deploy/studylog.service`, `server/deploy/runbook.md`
- Test: `server/tests/test_cli.py`

**Interfaces:**
- Consumes: `settle_day`, `sweep`, `remind_shortfall`, `nudge_restore`
- Produces: `python -m app.cli <settle|sweep|remind|nudge>`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/test_cli.py`:

```python
import pytest

from app.cli import COMMANDS, main


def test_every_cron_job_has_a_command():
    assert set(COMMANDS) == {"settle", "sweep", "remind", "nudge"}


def test_unknown_command_exits_nonzero(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["nope"])
    assert exc.value.code == 2


def test_missing_command_exits_nonzero():
    with pytest.raises(SystemExit) as exc:
        main([])
    assert exc.value.code == 2


def test_settle_targets_yesterday(monkeypatch, db):
    from datetime import timedelta

    from app.time_utils import now_utc, study_day

    seen = {}

    def fake_settle(session, day):
        seen["day"] = day
        return 0

    monkeypatch.setattr("app.cli.SessionLocal", lambda: db)
    monkeypatch.setattr("app.cli.settle_day", fake_settle)

    main(["settle"])
    assert seen["day"] == study_day(now_utc()) - timedelta(days=1)
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd server && python -m pytest tests/test_cli.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.cli'`

- [ ] **Step 3: CLI 작성**

`server/app/cli.py`:

```python
import logging
import sys
from datetime import timedelta

from app.batch.reminders import nudge_restore, remind_shortfall
from app.batch.sessions import sweep
from app.batch.settlement import settle_day
from app.db import SessionLocal
from app.time_utils import now_utc, study_day


def _settle(db) -> None:
    settle_day(db, study_day(now_utc()) - timedelta(days=1))


def _nudge(db) -> None:
    nudge_restore(db, study_day(now_utc()) - timedelta(days=1))


COMMANDS = {
    "settle": _settle,          # 04:00 — 전날을 확정한다
    "sweep": sweep,             # 5분마다 — 미종료 세션 경고·회수
    "remind": remind_shortfall,  # 22:00 — 목표 미달자에게 리마인드
    "nudge": _nudge,            # 08:00 — 어제 실패자에게 복구 유도
}


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1 or args[0] not in COMMANDS:
        print(f"usage: python -m app.cli {{{'|'.join(COMMANDS)}}}", file=sys.stderr)
        raise SystemExit(2)

    db = SessionLocal()
    try:
        COMMANDS[args[0]](db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && python -m pytest tests/test_cli.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: 배포 파일 작성**

`server/deploy/crontab` — 하루 경계가 KST이므로 `CRON_TZ`를 반드시 박는다:

```cron
CRON_TZ=Asia/Seoul
APP=/srv/studylog/server
PY=/srv/studylog/venv/bin/python

0  4 * * *  cd $APP && $PY -m app.cli settle  >> /var/log/studylog/settle.log 2>&1
0  8 * * *  cd $APP && $PY -m app.cli nudge   >> /var/log/studylog/nudge.log 2>&1
0 22 * * *  cd $APP && $PY -m app.cli remind  >> /var/log/studylog/remind.log 2>&1
*/5 * * * * cd $APP && $PY -m app.cli sweep   >> /var/log/studylog/sweep.log 2>&1
```

`server/deploy/studylog.service`:

```ini
[Unit]
Description=StudyLog API
After=network.target

[Service]
User=studylog
WorkingDirectory=/srv/studylog/server
EnvironmentFile=/srv/studylog/server/.env
ExecStart=/srv/studylog/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

`server/deploy/runbook.md`에 다음을 적는다.

1. **Lightsail** `t4g.small` / Ubuntu 24.04. nginx로 443 → 127.0.0.1:8000 리버스 프록시, certbot으로 인증서
2. **RDS** `db.t4g.micro`, gp3 20GB, 자동 백업 7일, 퍼블릭 액세스 끔, 보안그룹은 Lightsail만 허용
3. **S3** 버킷 `studylog-photos`. 퍼블릭 액세스 전면 차단 — 사진은 presigned URL로만 나간다. 인스턴스 역할에 `s3:PutObject`, `s3:GetObject`만 부여
4. **시크릿** `/srv/studylog/server/.env`, 소유자 `studylog`, 퍼미션 `600`. 채울 키: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `APPLE_BUNDLE_ID`, `GOOGLE_CLIENT_ID`, `S3_BUCKET`
5. **배포** `git pull` → `pip install -e .` → `alembic upgrade head` → `systemctl restart studylog`
6. **cron 등록** `crontab -u studylog server/deploy/crontab`
7. **RevenueCat** 대시보드에서 웹훅 URL을 `https://<도메인>/webhooks/revenuecat`으로, Authorization 헤더를 `Bearer <REVENUECAT_WEBHOOK_SECRET>`로 설정. 상품 ID는 `pass_3`, `pass_10`
8. **점검** 배포 후 `curl https://<도메인>/health`가 `{"status":"ok"}`를 주는지, `python -m app.cli sweep`이 에러 없이 끝나는지 확인

- [ ] **Step 6: 전체 테스트 실행**

Run: `cd server && python -m pytest -v`
Expected: 전 파일 PASS

- [ ] **Step 7: 커밋**

```bash
git add server/app/cli.py server/deploy server/tests/test_cli.py
git commit -m "feat(server): 배치 CLI와 배포 설정"
```

---

## 스펙 대조

| 스펙 | 태스크 |
|---|---|
| §1 미종료 0분 / 이의제기 / 다중 그룹 / haiku | 18 / 10 / 12 / 6 |
| §3 데이터 모델 8개 테이블 | 3 |
| §4.1 세션 시작·종료·상한 | 8, 9 |
| §4.2 이의제기와 시각 채택 | 10 |
| §4.3 정산 | 15 |
| §4.4 streak 복구 | 16 |
| §4.5 결제·웹훅·멱등 | 14 |
| §4.6 피드·사진 공개·랭킹 없음 | 13 |
| §4.7 목표 변경 예약 | 11(예약), 15(승격) |
| §5 알림 4종 | 18(미종료), 19(리마인드·복구·거절) |
| §6.1 어댑터 / §6.2 리사이즈 / §6.3~5 프롬프트·임계 / §6.6 타임아웃 | 5·6 / 7 / 5·6 / 5 |
| §9 인프라·cron·시크릿 | 20 |

**v1 범위 밖이라 태스크가 없는 것** — OpenAI·Gemini 프로바이더, pHash·EXIF 차단
(컬럼은 Task 3에서 만들고 Task 8에서 채우기만 한다), 순위표, deferred deep link,
자체 IAP 검증. 전부 스펙 §10의 "v1 이후"에 있다.

**앱(Expo RN)은 이 계획에 없다.** 서버 API가 고정된 뒤 별도 계획으로 쓴다.
