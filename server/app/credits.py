from datetime import date as Date, timedelta

from sqlalchemy.orm import Session

from app.domain import CHALLENGE_PRODUCTS
from app.models import Challenge, CreditLedger, User


class ChallengeError(Exception):
    """호출자가 HTTP 상태를 고를 수 있도록 원인을 구분한다."""


class UnknownProduct(ChallengeError):
    pass


class ChallengeAlreadyActive(ChallengeError):
    pass


class InsufficientCredit(ChallengeError):
    pass


def move(db: Session, user: User, delta: int, reason: str,
         ref_id: str | None = None) -> CreditLedger:
    """크레딧을 움직인다. 잔액과 원장을 항상 함께 갱신한다.

    크레딧은 돈이다. 잔액만 바꾸고 원장을 안 남기면 차이가 났을 때 추적할 수 없다.
    """
    new_balance = user.credit_balance + delta
    if new_balance < 0:
        raise InsufficientCredit()

    user.credit_balance = new_balance
    row = CreditLedger(user_id=user.id, delta=delta, reason=reason,
                       ref_id=ref_id, balance_after=new_balance)
    db.add(row)
    db.flush()
    return row


def active_challenge(db: Session, user_id: str) -> Challenge | None:
    return (db.query(Challenge)
              .filter_by(user_id=user_id, status="active")
              .one_or_none())


def start_challenge(db: Session, user: User, product_id: str,
                    paid_with: str, today: Date) -> Challenge:
    """챌린지를 연다. paid_with 가 'credit' 이면 참가비를 크레딧에서 뺀다.

    실패할 수 있는 검사는 전부 행을 만들기 전에 끝낸다. 행을 flush 한 뒤에 예외가
    나면, 호출자가 그 예외를 잡고 commit 하는 순간 공짜 챌린지가 남는다.
    """
    spec = CHALLENGE_PRODUCTS.get(product_id)
    if spec is None:
        raise UnknownProduct(product_id)
    if active_challenge(db, user.id) is not None:
        raise ChallengeAlreadyActive()
    if paid_with == "credit" and user.credit_balance < spec.price:
        raise InsufficientCredit()

    challenge = Challenge(
        user_id=user.id, product_id=product_id, entry_amount=spec.price,
        daily_payback=spec.daily_payback,
        # 크레딧 참가에 보너스를 주면 완주자가 크레딧을 무한 증식시킨다
        completion_bonus=spec.completion_bonus if paid_with == "iap" else 0,
        total_days=spec.days, started_on=today,
        ends_on=today + timedelta(days=spec.days - 1),
        paid_with=paid_with, status="active",
    )
    db.add(challenge)
    db.flush()

    if paid_with == "credit":
        move(db, user, -spec.price, "entry", challenge.id)
    return challenge
