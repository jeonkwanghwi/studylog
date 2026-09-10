import pytest

from app.credits import (ChallengeAlreadyActive, InsufficientCredit,
                         UnknownProduct, move, start_challenge)
from app.domain import CHALLENGE_PRODUCTS
from app.models import Challenge, CreditLedger, User
from app.time_utils import now_utc, study_day


@pytest.fixture()
def user(db):
    u = User(provider="apple", provider_sub="s", nickname="광휘")
    db.add(u)
    db.commit()
    return u


def test_product_table_is_the_full_grid():
    """기간 3종 x 하루 배팅액 3종."""
    assert set(CHALLENGE_PRODUCTS) == {
        f"challenge_{days}d_{k}k" for days in (7, 14, 30) for k in (1, 2, 3)
    }


def test_entry_fee_is_always_days_times_daily_stake():
    """전일 달성자가 낸 만큼 정확히 돌려받는다는 약속의 근거다."""
    for name, spec in CHALLENGE_PRODUCTS.items():
        assert spec.price == spec.days * spec.daily_payback, name


def test_completion_bonus_scales_with_duration_not_a_flat_amount():
    assert CHALLENGE_PRODUCTS["challenge_7d_3k"].completion_bonus == 0
    assert CHALLENGE_PRODUCTS["challenge_14d_2k"].completion_bonus == 1400
    assert CHALLENGE_PRODUCTS["challenge_30d_3k"].completion_bonus == 9000


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
    with pytest.raises(InsufficientCredit):
        move(db, user, -5000, "entry")


def test_iap_entry_carries_the_completion_bonus(db, user):
    challenge = start_challenge(db, user, "challenge_30d_1k", "iap", study_day(now_utc()))
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
    challenge = start_challenge(db, user, "challenge_30d_1k", "credit", study_day(now_utc()))
    db.commit()

    assert challenge.completion_bonus == 0
    assert user.credit_balance == 0
    assert db.query(CreditLedger).filter_by(reason="entry").one().delta == -30000


def test_credit_entry_requires_enough_balance(db, user):
    with pytest.raises(InsufficientCredit):
        start_challenge(db, user, "challenge_30d_1k", "credit", study_day(now_utc()))


def test_failed_credit_entry_leaves_no_challenge_row(db, user):
    """검사가 행 생성보다 앞서야 한다. 뒤에 있으면 호출자가 예외를 잡고 commit 할 때
    공짜 챌린지가 남는다."""
    move(db, user, 1000, "purchase")
    db.commit()
    with pytest.raises(InsufficientCredit):
        start_challenge(db, user, "challenge_30d_1k", "credit", study_day(now_utc()))
    db.commit()

    assert db.query(Challenge).count() == 0
    assert user.credit_balance == 1000


def test_only_one_active_challenge_per_user(db, user):
    start_challenge(db, user, "challenge_7d_1k", "iap", study_day(now_utc()))
    db.commit()
    with pytest.raises(ChallengeAlreadyActive):
        start_challenge(db, user, "challenge_7d_1k", "iap", study_day(now_utc()))


def test_unknown_product_raises_its_own_error(db, user):
    with pytest.raises(UnknownProduct):
        start_challenge(db, user, "challenge_999", "iap", study_day(now_utc()))


def test_join_by_credit_endpoint(client, auth, db):
    user = db.query(User).one()
    move(db, user, 7000, "purchase")
    db.commit()

    r = client.post("/challenges", headers=auth, json={"product_id": "challenge_7d_1k"})
    assert r.status_code == 200
    assert r.json()["paid_with"] == "credit"
    db.refresh(user)
    assert user.credit_balance == 0


def test_join_by_credit_without_balance_is_payment_required(client, auth):
    r = client.post("/challenges", headers=auth, json={"product_id": "challenge_7d_1k"})
    assert r.status_code == 402


def test_unknown_product_is_a_bad_request_not_payment_required(client, auth, db):
    """402는 결제하면 해결된다는 뜻이다. 없는 상품에 402를 주면 앱이 결제창을 띄우고
    유저는 돈만 내고 아무것도 못 받는다."""
    user = db.query(User).one()
    move(db, user, 30000, "purchase")
    db.commit()

    r = client.post("/challenges", headers=auth, json={"product_id": "challenge_999"})
    assert r.status_code == 400


def test_joining_while_active_is_a_conflict_not_payment_required(client, auth, db):
    user = db.query(User).one()
    move(db, user, 20000, "purchase")
    db.commit()
    client.post("/challenges", headers=auth, json={"product_id": "challenge_7d_1k"})

    r = client.post("/challenges", headers=auth, json={"product_id": "challenge_7d_1k"})
    assert r.status_code == 409
    db.refresh(user)
    assert user.credit_balance == 13000        # 두 번째 참가비는 빠지지 않았다


def test_current_challenge_endpoint(client, auth, db):
    assert client.get("/challenges/current", headers=auth).json() is None
    user = db.query(User).one()
    move(db, user, 7000, "purchase")
    db.commit()
    client.post("/challenges", headers=auth, json={"product_id": "challenge_7d_1k"})
    assert client.get("/challenges/current", headers=auth).json()["status"] == "active"
