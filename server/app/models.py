import uuid
from datetime import UTC, date as Date
from datetime import datetime

from sqlalchemy import (JSON, Date as SADate, DateTime, Float, ForeignKey,
                        Index, Integer, String, Text, TypeDecorator,
                        UniqueConstraint, text)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.time_utils import now_utc


def _uuid() -> str:
    return str(uuid.uuid4())


class UTCDateTime(TypeDecorator):
    """모든 시각을 UTC aware로 통일한다.

    SQLite는 tzinfo를 버리고, Postgres도 naive를 받으면 그대로 넣는다.
    이 서버는 로직 절반이 시각 뺄셈이라 naive가 하나만 섞여도 TypeError가 난다.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime은 저장할 수 없습니다")
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value if value.tzinfo else value.replace(tzinfo=UTC)


TS = UTCDateTime()


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
    credit_balance: Mapped[int] = mapped_column(Integer, default=0)   # 원 단위
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
    challenge_id: Mapped[str | None] = mapped_column(ForeignKey("challenges.id"), nullable=True)
    payback_amount: Mapped[int] = mapped_column(Integer, default=0)
    streak_snapshot: Mapped[int] = mapped_column(Integer)
    settled_at: Mapped[datetime] = mapped_column(TS, default=now_utc)


class Challenge(Base):
    __tablename__ = "challenges"
    # 활성 챌린지는 유저당 1개. 애플리케이션 검사만으로는 웹훅 동시 도착을 막지 못한다.
    __table_args__ = (
        Index("uq_one_active_challenge_per_user", "user_id", unique=True,
              sqlite_where=text("status = 'active'"),
              postgresql_where=text("status = 'active'")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    product_id: Mapped[str] = mapped_column(String(32))     # challenge_7d_1k | challenge_30d_3k 등
    entry_amount: Mapped[int] = mapped_column(Integer)      # 낸 참가비 (원)
    daily_payback: Mapped[int] = mapped_column(Integer)     # 하루 달성 시 적립액
    completion_bonus: Mapped[int] = mapped_column(Integer, default=0)
    total_days: Mapped[int] = mapped_column(Integer)
    started_on: Mapped[Date] = mapped_column(SADate)
    ends_on: Mapped[Date] = mapped_column(SADate)
    paid_with: Mapped[str] = mapped_column(String(8))       # iap | credit
    status: Mapped[str] = mapped_column(String(10))         # active | completed | refunded
    created_at: Mapped[datetime] = mapped_column(TS, default=now_utc)


class CreditLedger(Base):
    """크레딧 증감 원장. 잔액만 들고 있으면 "왜 3천원이 비지?"에 답할 수 없다."""

    __tablename__ = "credit_ledger"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    delta: Mapped[int] = mapped_column(Integer)             # ±원
    # purchase | payback | bonus | entry | restore | expire | refund
    reason: Mapped[str] = mapped_column(String(16))
    ref_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    balance_after: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(TS, default=now_utc)


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    revenuecat_event_id: Mapped[str] = mapped_column(String(64), unique=True)
    product_id: Mapped[str] = mapped_column(String(32))
    amount: Mapped[int] = mapped_column(Integer)
    challenge_id: Mapped[str | None] = mapped_column(ForeignKey("challenges.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=now_utc)
