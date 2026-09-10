import pytest

from app.credits import move, start_challenge
from app.domain import CHALLENGE_PRODUCTS
from app.models import Challenge, CreditLedger, User
from app.time_utils import now_utc, study_day


@pytest.fixture()
def user(db):
    u = User(provider="apple", provider_sub="s", nickname="광휘")
    db.add(u)
    db.commit()
    return u


def test_product_table_matches_the_spec():
    seven = CHALLENGE_PRODUCTS["challenge_7d"]
    assert (seven.days, seven.price, seven.daily_payback, seven.completion_bonus) == (7, 7000, 1000, 0)
    thirty = CHALLENGE_PRODUCTS["challenge_30d"]
    assert (thirty.days, thirty.price, thirty.daily_payback, thirty.completion_bonus) == (30, 30000, 1000, 3000)


def test_daily_payback_never_exceeds_entry_per_day():
    """넘으면 완주자가 낸 돈보다 많이 받아가고 크레딧이 무한 증식한다."""
    for spec in CHALLENGE_PRODUCTS.values():
        assert spec.daily_payback * spec.days <= spec.price


def test_move_updates_balance_and_writes_a_ledger_row(db, user):
    move(db, user, 7000, "purchase")
    db.commit()

    assert user.credit_balance == 7000
    row = db.query(CreditLedger).one()
    assert (row.delta, row.reason, row.balance_after) == (7000, "purchase", 7000)


def test_move_records_running_balance(db, user):
    move(db, user, 5000, "purchase")
    move(db, user, -2000, "restore")
    db.commit()

    assert user.credit_balance == 3000
    balances = [r.balance_after for r in db.query(CreditLedger).order_by(CreditLedger.created_at)]
    assert balances[-1] == 3000


def test_balance_never_goes_negative(db, user):
    move(db, user, 1000, "purchase")
    db.commit()
    with pytest.raises(ValueError):
        move(db, user, -5000, "entry")


def test_iap_entry_carries_the_completion_bonus(db, user):
    challenge = start_challenge(db, user, "challenge_30d", "iap", study_day(now_utc()))
    db.commit()

    assert challenge.status == "active"
    assert challenge.paid_with == "iap"
    assert challenge.completion_bonus == 3000
    assert challenge.total_days == 30
    assert (challenge.ends_on - challenge.started_on).days == 29


def test_credit_entry_gets_no_completion_bonus(db, user):
    """크레딧 참가에도 보너스를 주면 완주자가 크레딧을 무한 증식시킨다."""
    move(db, user, 30000, "purchase")
    db.commit()
    challenge = start_challenge(db, user, "challenge_30d", "credit", study_day(now_utc()))
    db.commit()

    assert challenge.completion_bonus == 0
    assert user.credit_balance == 0
    assert db.query(CreditLedger).filter_by(reason="entry").one().delta == -30000


def test_credit_entry_requires_enough_balance(db, user):
    with pytest.raises(ValueError):
        start_challenge(db, user, "challenge_30d", "credit", study_day(now_utc()))


def test_only_one_active_challenge_per_user(db, user):
    start_challenge(db, user, "challenge_7d", "iap", study_day(now_utc()))
    db.commit()
    with pytest.raises(ValueError):
        start_challenge(db, user, "challenge_7d", "iap", study_day(now_utc()))


def test_join_by_credit_endpoint(client, auth, db):
    user = db.query(User).one()
    move(db, user, 7000, "purchase")
    db.commit()

    r = client.post("/challenges", headers=auth, json={"product_id": "challenge_7d"})
    assert r.status_code == 200
    assert r.json()["paid_with"] == "credit"
    db.refresh(user)
    assert user.credit_balance == 0


def test_join_by_credit_without_balance_is_payment_required(client, auth):
    r = client.post("/challenges", headers=auth, json={"product_id": "challenge_7d"})
    assert r.status_code == 402


def test_current_challenge_endpoint(client, auth, db):
    assert client.get("/challenges/current", headers=auth).json() is None
    user = db.query(User).one()
    move(db, user, 7000, "purchase")
    db.commit()
    client.post("/challenges", headers=auth, json={"product_id": "challenge_7d"})
    assert client.get("/challenges/current", headers=auth).json()["status"] == "active"
