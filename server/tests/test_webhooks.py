import logging

from app.config import settings
from app.models import Challenge, CreditLedger, Purchase, User

HEADERS = {"Authorization": f"Bearer {settings.revenuecat_webhook_secret}"}


def event(user_id, event_id="evt-1", product_id="challenge_7d_1k",
          type_="NON_RENEWING_PURCHASE"):
    return {"event": {"id": event_id, "type": type_,
                      "app_user_id": user_id, "product_id": product_id}}


def test_purchase_starts_a_challenge(client, auth, db):
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat", headers=HEADERS, json=event(user.id))

    assert r.status_code == 200 and r.json()["started"] is True
    challenge = db.query(Challenge).one()
    assert challenge.status == "active" and challenge.paid_with == "iap"
    assert challenge.entry_amount == 7000
    assert db.query(Purchase).one().challenge_id == challenge.id


def test_purchase_does_not_credit_the_entry_fee(client, auth, db):
    """참가비는 크레딧이 아니라 챌린지가 된다. 크레딧으로 넣으면 즉시 환급이나 마찬가지다."""
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=event(user.id))

    db.refresh(user)
    assert user.credit_balance == 0
    assert db.query(CreditLedger).filter_by(reason="purchase").count() == 0


def test_replayed_event_starts_nothing_extra(client, auth, db):
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=event(user.id))
    r = client.post("/webhooks/revenuecat", headers=HEADERS, json=event(user.id))

    assert r.json()["started"] is False
    assert db.query(Challenge).count() == 1
    assert db.query(Purchase).count() == 1


def test_wrong_secret_is_rejected(client, auth, db):
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat",
                    headers={"Authorization": "Bearer nope"}, json=event(user.id))
    assert r.status_code == 401
    assert db.query(Challenge).count() == 0


def test_unrelated_event_types_are_ignored(client, auth, db):
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat", headers=HEADERS,
                    json=event(user.id, type_="TEST"))
    assert r.status_code == 200 and r.json()["started"] is False
    assert db.query(Challenge).count() == 0


def test_unknown_product_asks_for_a_retry(client, auth, db):
    """200을 주면 RevenueCat이 재시도를 멈춘다. 돈은 이미 걷혔는데 기록이 없어진다."""
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat", headers=HEADERS,
                    json=event(user.id, product_id="challenge_999"))
    assert r.status_code == 503
    assert db.query(Challenge).count() == 0


def test_unknown_user_is_recorded_without_starting_a_challenge(client, auth, db):
    """알 수 없는 app_user_id는 상품과 다르다 — 재시도해도 영원히 안 풀린다.
    재시도를 유도하는 5xx 대신 영수증만 남기고 200으로 닫는다."""
    r = client.post("/webhooks/revenuecat", headers=HEADERS, json=event("no-such-user"))
    assert r.status_code == 200 and r.json()["started"] is False

    purchase = db.query(Purchase).one()
    assert purchase.user_id is None
    assert purchase.challenge_id is None
    assert db.query(Challenge).count() == 0


def test_over_cap_iap_purchase_still_starts_a_challenge(client, auth, db):
    """첫 챌린지 상한은 크레딧 참가에만 건다. 웹훅이 도착했을 때는 이미 애플이
    돈을 걷은 뒤이므로, 여기서 거절하면 유저가 결제하고 아무것도 못 받는다."""
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat", headers=HEADERS,
                    json=event(user.id, product_id="challenge_14d_3k"))

    assert r.status_code == 200 and r.json()["started"] is True
    challenge = db.query(Challenge).one()
    assert challenge.status == "active"
    assert challenge.entry_amount == 42000


def test_matching_charged_price_logs_no_mismatch(client, auth, db, caplog):
    """price_in_purchased_currency(원화)가 spec과 일치하면 됐다. price(USD 환산값,
    5.99 같은 값)는 무시해야 한다 — 그걸 원화와 비교하면 정상 결제마다 불일치가
    찍힌다."""
    user = db.query(User).one()
    payload = event(user.id)
    payload["event"]["price_in_purchased_currency"] = 7000
    payload["event"]["price"] = 5.99

    with caplog.at_level(logging.ERROR, logger="app.routers.webhooks"):
        r = client.post("/webhooks/revenuecat", headers=HEADERS, json=payload)

    assert r.status_code == 200 and r.json()["started"] is True
    assert "금액 불일치" not in caplog.text


def test_mismatched_charged_price_logs_but_still_starts_the_challenge(client, auth, db, caplog):
    user = db.query(User).one()
    payload = event(user.id)
    payload["event"]["price_in_purchased_currency"] = 5000   # 7000이어야 한다

    with caplog.at_level(logging.ERROR, logger="app.routers.webhooks"):
        r = client.post("/webhooks/revenuecat", headers=HEADERS, json=payload)

    assert r.status_code == 200 and r.json()["started"] is True
    assert "금액 불일치" in caplog.text
    assert db.query(Challenge).one().entry_amount == 7000    # 그래도 기록대로 챌린지는 연다


def test_second_purchase_while_active_is_recorded_but_starts_nothing(client, auth, db):
    """활성 챌린지는 1개다. 영수증은 남기되 두 번째 챌린지를 열지 않는다."""
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=event(user.id))
    r = client.post("/webhooks/revenuecat", headers=HEADERS,
                    json=event(user.id, event_id="evt-2"))

    assert r.json()["started"] is False
    assert db.query(Challenge).count() == 1
    assert db.query(Purchase).count() == 2
