from datetime import timedelta

import pytest

from app.batch.settlement import settle_day
from app.models import DailyRecord, Photo, StudySession, User
from app.time_utils import day_bounds, now_utc, study_day


@pytest.fixture()
def user(db):
    u = User(provider="apple", provider_sub="s", nickname="광휘",
             daily_goal_minutes=60, streak_count=3, credit_balance=0)
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


def test_success_pays_back_and_writes_a_ledger_row(db, user):
    from app.credits import start_challenge
    from app.models import CreditLedger

    day = study_day(now_utc()) - timedelta(days=1)
    challenge = start_challenge(db, user, "challenge_30d_1k", "iap", day)
    db.commit()
    add_session(db, user, day, 70)

    settle_day(db, day)
    db.refresh(user)

    record = db.query(DailyRecord).one()
    assert record.result == "success"
    assert record.payback_amount == 1000
    assert record.challenge_id == challenge.id
    assert user.credit_balance == 1000
    assert db.query(CreditLedger).filter_by(reason="payback").one().delta == 1000


def test_failure_pays_back_nothing(db, user):
    from app.credits import start_challenge
    from app.models import CreditLedger

    day = study_day(now_utc()) - timedelta(days=1)
    start_challenge(db, user, "challenge_30d_1k", "iap", day)
    db.commit()
    add_session(db, user, day, 10)

    settle_day(db, day)
    db.refresh(user)

    assert db.query(DailyRecord).one().payback_amount == 0
    assert user.credit_balance == 0
    assert db.query(CreditLedger).filter_by(reason="payback").count() == 0


def test_success_without_a_challenge_pays_nothing_but_keeps_streak(db, user):
    day = study_day(now_utc()) - timedelta(days=1)
    add_session(db, user, day, 70)

    settle_day(db, day)
    db.refresh(user)

    assert db.query(DailyRecord).one().payback_amount == 0
    assert db.query(DailyRecord).one().challenge_id is None
    assert user.credit_balance == 0
    assert user.streak_count == 4


def test_challenge_closes_with_a_bonus_on_a_perfect_run(db, user):
    from app.credits import start_challenge
    from app.models import Challenge, CreditLedger

    start = study_day(now_utc()) - timedelta(days=7)
    challenge = start_challenge(db, user, "challenge_7d_1k", "iap", start)
    challenge.completion_bonus = 500       # 7일권엔 원래 보너스가 없다. 지급 경로만 검증한다
    db.commit()

    for offset in range(7):
        day = start + timedelta(days=offset)
        add_session(db, user, day, 70)
        settle_day(db, day)

    db.refresh(challenge)
    db.refresh(user)
    assert challenge.status == "completed"
    assert user.credit_balance == 7 * 1000 + 500
    assert db.query(CreditLedger).filter_by(reason="bonus").one().delta == 500


def test_a_restored_day_does_not_count_as_completion(db, user):
    """복구는 연속 기록을 사는 상품이고 보너스는 완주에 대한 보상이다.
    되산 날을 완주로 쳐주면, 챌린지가 닫히기 전에 복구했는지 뒤에 했는지에 따라
    결과가 갈린다."""
    from app.credits import start_challenge
    from app.models import CreditLedger

    start = study_day(now_utc()) - timedelta(days=7)
    challenge = start_challenge(db, user, "challenge_7d_1k", "iap", start)
    challenge.completion_bonus = 500
    db.commit()

    # 3일차를 실패하고, 챌린지가 닫히기 **전에** 복구해 둔다.
    # 복구를 마감 뒤에 하면 옛 로직("failed 없음")도 보너스를 막으므로
    # 두 로직이 구분되지 않는다. 마감 전에 복구해야 진짜 검증이 된다.
    for offset in range(4):
        day = start + timedelta(days=offset)
        add_session(db, user, day, 10 if offset == 3 else 70)
        settle_day(db, day)

    missed = db.query(DailyRecord).filter_by(date=start + timedelta(days=3)).one()
    missed.result = "passed"
    db.commit()

    for offset in range(4, 7):
        day = start + timedelta(days=offset)
        add_session(db, user, day, 70)
        settle_day(db, day)

    db.refresh(challenge)
    assert challenge.status == "completed"
    # 마감 시점의 결과는 [success x6, passed] — failed 는 없지만 완주도 아니다
    results = {r.result for r in db.query(DailyRecord)
                                   .filter_by(challenge_id=challenge.id)}
    assert results == {"success", "passed"}
    assert db.query(CreditLedger).filter_by(reason="bonus").count() == 0


def test_days_outside_the_challenge_window_pay_nothing(db, user):
    """배치가 밀렸다 따라잡을 때, 챌린지 시작 전날이 정산되면 기간 밖인데도
    페이백이 나가고 그날이 완주 판정에까지 끼어든다."""
    from app.credits import start_challenge
    from app.models import CreditLedger

    today = study_day(now_utc())
    start_challenge(db, user, "challenge_7d_1k", "iap", today)
    db.commit()

    before = today - timedelta(days=1)
    add_session(db, user, before, 70)
    settle_day(db, before)
    db.refresh(user)

    record = db.query(DailyRecord).filter_by(date=before).one()
    assert record.payback_amount == 0
    assert record.challenge_id is None
    assert user.credit_balance == 0
    assert db.query(CreditLedger).filter_by(reason="payback").count() == 0


def test_bonus_requires_every_day_of_the_run_to_be_settled(db, user):
    """실패한 날이 없다는 것만으로는 완주가 아니다. 정산이 누락된 날은
    실패로도 잡히지 않으므로, 구멍 난 런에 보너스가 나가면 안 된다."""
    from app.credits import start_challenge
    from app.models import Challenge, CreditLedger

    start = study_day(now_utc()) - timedelta(days=7)
    challenge = start_challenge(db, user, "challenge_7d_1k", "iap", start)
    challenge.completion_bonus = 500
    db.commit()

    for offset in range(7):
        if offset == 2:
            continue                      # 이 날은 정산이 누락됐다
        day = start + timedelta(days=offset)
        add_session(db, user, day, 70)
        settle_day(db, day)

    db.refresh(challenge)
    assert challenge.status == "completed"
    assert db.query(CreditLedger).filter_by(reason="bonus").count() == 0


def test_a_single_miss_forfeits_the_completion_bonus(db, user):
    from app.credits import start_challenge
    from app.models import Challenge, CreditLedger

    start = study_day(now_utc()) - timedelta(days=7)
    challenge = start_challenge(db, user, "challenge_7d_1k", "iap", start)
    challenge.completion_bonus = 500
    db.commit()

    for offset in range(7):
        day = start + timedelta(days=offset)
        add_session(db, user, day, 10 if offset == 3 else 70)
        settle_day(db, day)

    db.refresh(challenge)
    db.refresh(user)
    assert challenge.status == "completed"
    assert db.query(CreditLedger).filter_by(reason="bonus").count() == 0
    assert user.credit_balance == 6 * 1000


def test_shortfall_breaks_the_streak(db, user):
    day = study_day(now_utc()) - timedelta(days=1)
    add_session(db, user, day, 10)

    settle_day(db, day)
    db.refresh(user)
    assert user.streak_count == 0
    record = db.query(DailyRecord).one()
    assert record.result == "failed"
    assert record.streak_snapshot == 0
    assert record.payback_amount == 0


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
