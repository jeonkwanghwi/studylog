from app.config import settings
from app.models import Challenge, CreditLedger, Purchase, User

HEADERS = {"Authorization": f"Bearer {settings.revenuecat_webhook_secret}"}


def event(user_id, event_id="evt-1", product_id="challenge_7d",
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


def test_unknown_product_starts_nothing(client, auth, db):
    user = db.query(User).one()
    r = client.post("/webhooks/revenuecat", headers=HEADERS,
                    json=event(user.id, product_id="challenge_999"))
    assert r.json()["started"] is False


def test_unknown_user_is_ignored(client, auth):
    r = client.post("/webhooks/revenuecat", headers=HEADERS, json=event("no-such-user"))
    assert r.status_code == 200 and r.json()["started"] is False


def test_second_purchase_while_active_is_recorded_but_starts_nothing(client, auth, db):
    """활성 챌린지는 1개다. 영수증은 남기되 두 번째 챌린지를 열지 않는다."""
    user = db.query(User).one()
    client.post("/webhooks/revenuecat", headers=HEADERS, json=event(user.id))
    r = client.post("/webhooks/revenuecat", headers=HEADERS,
                    json=event(user.id, event_id="evt-2"))

    assert r.json()["started"] is False
    assert db.query(Challenge).count() == 1
    assert db.query(Purchase).count() == 2
