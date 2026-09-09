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
    assert user.credit_balance == 0
    assert user.pending_goal_minutes is None


def test_datetimes_round_trip_as_utc_aware(db):
    from datetime import UTC, datetime

    user = User(provider="apple", provider_sub="sub-tz", nickname="시각")
    db.add(user)
    db.commit()

    photo = Photo(user_id=user.id, kind="start", s3_key="k", status="pass",
                  received_at=datetime(2026, 9, 9, 1, 30, tzinfo=UTC))
    db.add(photo)
    db.commit()
    db.expire_all()

    loaded = db.get(Photo, photo.id)
    assert loaded.received_at.tzinfo is not None
    assert loaded.received_at == datetime(2026, 9, 9, 1, 30, tzinfo=UTC)


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
