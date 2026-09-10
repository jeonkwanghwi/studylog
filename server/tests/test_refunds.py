from datetime import timedelta

from app.config import settings
from app.credits import move, start_challenge
from app.models import Challenge, CreditLedger, DailyRecord, Purchase, User
from app.time_utils import now_utc, study_day

HEADERS = {"Authorization": f"Bearer {settings.revenuecat_webhook_secret}"}


def purchase_event(user_id, event_id="evt-buy", product_id="challenge_7d_1k",
                   txn="txn-1"):
    return {"event": {"id": event_id, "type": "NON_RENEWING_PURCHASE",
                      "app_user_id": user_id, "product_id": product_id,
                      "transaction_id": txn}}


def refund_event(user_id, event_id="evt-refund", txn="txn-1"):
    return {"event": {"id": event_id, "type": "CANCELLATION",
                      "app_user_id": user_id, "product_id": "challenge_7d_1k",
                      "transaction_id": txn}}


def test_purchase_records_the_transaction_id(client, auth, db):
    """환불 이벤트를 원 결제와 이을 유일한 열쇠다."""
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=purchase_event(user.id))
    assert db.query(Purchase).one().transaction_id == "txn-1"


def test_refund_closes_the_challenge_and_claws_back_credit(client, auth, db):
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=purchase_event(user.id))
    challenge = db.query(Challenge).one()

    # 이틀치 페이백이 적립된 상태를 만든다 (챌린지 기간 내 서로 다른 날짜)
    for offset in range(2):
        record = DailyRecord(
            user_id=user.id, date=challenge.started_on + timedelta(days=offset),
            total_minutes=70, goal_minutes=60, result="success",
            challenge_id=challenge.id, payback_amount=1000,
            streak_snapshot=offset + 1, settled_at=now_utc(),
        )
        db.add(record)
        db.flush()
        move(db, user, 1000, "payback", record.id)
    db.commit()
    assert user.credit_balance == 2000

    r = client.post("/webhooks/revenuecat", headers=HEADERS, json=refund_event(user.id))
    assert r.status_code == 200

    db.refresh(user)
    db.refresh(challenge)
    assert challenge.status == "refunded"
    assert user.credit_balance == 0
    assert db.query(CreditLedger).filter_by(reason="refund").one().delta == -2000


def test_refund_flags_the_account(client, auth, db):
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=purchase_event(user.id))
    client.post("/webhooks/revenuecat", headers=HEADERS, json=refund_event(user.id))

    db.refresh(user)
    assert user.refund_count == 1


def test_claw_back_floors_at_zero_balance(client, auth, db):
    """이미 쓴 크레딧은 회수할 수 없다. 잔액을 음수로 만들지 않는다."""
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=purchase_event(user.id))
    challenge = db.query(Challenge).one()

    record = DailyRecord(user_id=user.id, date=challenge.started_on,
                         total_minutes=70, goal_minutes=60, result="success",
                         challenge_id=challenge.id, payback_amount=1000,
                         streak_snapshot=1, settled_at=now_utc())
    db.add(record)
    db.flush()
    move(db, user, 1000, "payback", record.id)
    move(db, user, -1000, "entry", None)     # 이미 다 써버렸다
    db.commit()
    assert user.credit_balance == 0

    client.post("/webhooks/revenuecat", headers=HEADERS, json=refund_event(user.id))
    db.refresh(user)
    assert user.credit_balance == 0
    assert user.refund_count == 1


def test_refund_frees_the_user_to_start_a_new_challenge(client, auth, db):
    """refunded 는 active 가 아니므로 부분 유니크 인덱스에 걸리지 않는다."""
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=purchase_event(user.id))
    client.post("/webhooks/revenuecat", headers=HEADERS, json=refund_event(user.id))

    started = start_challenge(db, user, "challenge_7d_1k", "iap", study_day(now_utc()))
    db.commit()
    assert started.status == "active"


def test_refund_for_an_unknown_transaction_is_acknowledged(client, auth, db):
    """모르는 거래의 환불은 재시도해도 달라지지 않는다. 로그만 남기고 닫는다."""
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat", headers=HEADERS,
                    json=refund_event(user.id, txn="txn-nope"))
    assert r.status_code == 200


def test_replayed_refund_claws_back_only_once(client, auth, db):
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=purchase_event(user.id))
    challenge = db.query(Challenge).one()

    record = DailyRecord(user_id=user.id, date=challenge.started_on,
                         total_minutes=70, goal_minutes=60, result="success",
                         challenge_id=challenge.id, payback_amount=1000,
                         streak_snapshot=1, settled_at=now_utc())
    db.add(record)
    db.flush()
    move(db, user, 1000, "payback", record.id)
    db.commit()

    client.post("/webhooks/revenuecat", headers=HEADERS, json=refund_event(user.id))
    client.post("/webhooks/revenuecat", headers=HEADERS,
                json=refund_event(user.id, event_id="evt-refund-2"))

    db.refresh(user)
    assert db.query(CreditLedger).filter_by(reason="refund").count() == 1
    assert user.refund_count == 1
