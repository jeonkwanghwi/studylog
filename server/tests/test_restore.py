from datetime import timedelta

import pytest

from app.models import DailyRecord, User
from app.time_utils import now_utc, study_day


@pytest.fixture()
def failed_record(client, auth, db):
    """어제 failed. 그저께는 streak 6에서 끝나 있었다."""
    user = db.query(User).one()
    user.streak_count = 0
    user.credit_balance = 2000
    yesterday = study_day(now_utc()) - timedelta(days=1)

    db.add(DailyRecord(user_id=user.id, date=yesterday - timedelta(days=1),
                       total_minutes=90, goal_minutes=60, result="success",
                       payback_amount=1000, streak_snapshot=6,
                       settled_at=now_utc() - timedelta(days=1)))
    record = DailyRecord(user_id=user.id, date=yesterday, total_minutes=10,
                         goal_minutes=60, result="failed", payback_amount=0,
                         streak_snapshot=0,
                         settled_at=now_utc() - timedelta(hours=2))
    db.add(record)
    db.commit()
    return record


def test_restore_costs_credit_and_rebuilds_the_streak(client, auth, db, failed_record):
    from app.models import CreditLedger

    r = client.post(f"/records/{failed_record.id}/restore", headers=auth)
    assert r.status_code == 200
    assert r.json()["result"] == "passed"

    user = db.query(User).one()
    db.refresh(user)
    assert user.credit_balance == 0
    assert user.streak_count == 7        # 전날 스냅샷 6 + 1
    assert db.query(CreditLedger).filter_by(reason="restore").one().delta == -2000


def test_restore_does_not_refund_that_days_payback(client, auth, db, failed_record):
    """되사는 것은 연속 기록이지 그날의 성과가 아니다."""
    client.post(f"/records/{failed_record.id}/restore", headers=auth)
    db.refresh(failed_record)
    assert failed_record.payback_amount == 0


def test_restore_needs_enough_credit(client, auth, db, failed_record):
    user = db.query(User).one()
    user.credit_balance = 1000
    db.commit()

    r = client.post(f"/records/{failed_record.id}/restore", headers=auth)
    assert r.status_code == 402
    db.refresh(user)
    assert user.credit_balance == 1000


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
    user.credit_balance = 4000
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
