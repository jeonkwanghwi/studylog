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
