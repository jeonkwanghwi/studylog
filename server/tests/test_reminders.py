from datetime import timedelta

import pytest

from app import notifications
from app.batch.reminders import nudge_challenge_end, nudge_restore, remind_shortfall
from app.credits import move
from app.models import Challenge, DailyRecord, Photo, StudySession, User
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
    db.add(StudySession(user_id=user.id, start_photo_id=photo.id, activity="공부",
                        started_at=at,
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


def make_challenge(db, user, ends_on, status="completed", total_days=7,
                   daily_payback=1000):
    challenge = Challenge(
        user_id=user.id, product_id="challenge_7d_1k", entry_amount=7000,
        daily_payback=daily_payback, completion_bonus=0, total_days=total_days,
        started_on=ends_on - timedelta(days=total_days - 1), ends_on=ends_on,
        paid_with="iap", status=status,
    )
    db.add(challenge)
    db.commit()
    return challenge


def test_nudge_targets_yesterdays_failures_only(db, sent):
    failed = make_user(db, "실패")
    passed = make_user(db, "방어")
    yesterday = study_day(now_utc()) - timedelta(days=1)
    challenge = make_challenge(db, failed, yesterday, daily_payback=1500)

    db.add(DailyRecord(user_id=failed.id, date=yesterday, total_minutes=0,
                       goal_minutes=60, result="failed", challenge_id=challenge.id,
                       streak_snapshot=0, settled_at=now_utc()))
    db.add(DailyRecord(user_id=passed.id, date=yesterday, total_minutes=0,
                       goal_minutes=60, result="passed", streak_snapshot=5,
                       settled_at=now_utc()))
    db.commit()

    assert nudge_restore(db, yesterday) == 1
    assert len(sent) == 1
    assert sent[0].token == failed.expo_push_token
    assert "1,500" in sent[0].body      # 놓친 하루치 페이백
    assert "2,000" in sent[0].body      # 복구 비용


def test_nudge_ignores_failures_without_a_challenge(db, sent):
    """챌린지 없이 실패한 날은 페이백이 애초에 0원이다. '돈을 놓쳤다'고 알리면 거짓말이다."""
    failed = make_user(db, "챌린지없음")
    yesterday = study_day(now_utc()) - timedelta(days=1)

    db.add(DailyRecord(user_id=failed.id, date=yesterday, total_minutes=0,
                       goal_minutes=60, result="failed", streak_snapshot=0,
                       settled_at=now_utc()))
    db.commit()

    assert nudge_restore(db, yesterday) == 0
    assert sent == []


def test_nudge_sends_nothing_when_nobody_failed(db, sent):
    make_user(db, "아무개")
    assert nudge_restore(db, study_day(now_utc()) - timedelta(days=1)) == 0
    assert sent == []


def test_nudge_challenge_end_fires_for_a_just_ended_challenge(db, sent):
    user = make_user(db, "완주")
    day = study_day(now_utc())
    challenge = make_challenge(db, user, day)

    db.add(DailyRecord(user_id=user.id, date=day, total_minutes=70, goal_minutes=60,
                       result="success", challenge_id=challenge.id, payback_amount=1000,
                       streak_snapshot=7, settled_at=now_utc()))
    db.commit()
    move(db, user, 500, "bonus", challenge.id)
    db.commit()

    assert nudge_challenge_end(db, day) == 1
    assert len(sent) == 1
    assert sent[0].token == user.expo_push_token
    assert "1,500" in sent[0].body


def test_nudge_challenge_end_does_not_fire_for_an_active_challenge(db, sent):
    user = make_user(db, "진행중")
    day = study_day(now_utc())
    make_challenge(db, user, day, status="active")

    assert nudge_challenge_end(db, day) == 0
    assert sent == []


def test_rejection_push_is_sent_on_fail(client, auth, jpeg, db, judge, sent):
    from app.judge.base import Verdict
    db.query(User).one().expo_push_token = "ExponentPushToken[y]"
    db.commit()
    judge.verdict = Verdict("fail", 0.95, "게임 화면입니다.", {})

    client.post("/sessions/start", headers=auth,
                data={"activity": "공부"},
                files={"image": ("s.jpg", jpeg, "image/jpeg")})

    assert len(sent) == 1
    assert sent[0].body == "게임 화면입니다."


def test_no_rejection_push_on_pass(client, auth, jpeg, db, sent):
    db.query(User).one().expo_push_token = "ExponentPushToken[y]"
    db.commit()
    client.post("/sessions/start", headers=auth,
                data={"activity": "공부"},
                files={"image": ("s.jpg", jpeg, "image/jpeg")})
    assert sent == []
