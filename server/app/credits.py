import logging
from datetime import date as Date, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.domain import CHALLENGE_PRODUCTS
from app.models import Challenge, CreditLedger, DailyRecord, User

logger = logging.getLogger(__name__)


class ChallengeError(Exception):
    """호출자가 HTTP 상태를 고를 수 있도록 원인을 구분한다."""


class UnknownProduct(ChallengeError):
    pass


class ChallengeAlreadyActive(ChallengeError):
    pass


class InsufficientCredit(ChallengeError):
    pass


class EntryTooLargeForFirstChallenge(ChallengeError):
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


def entry_limit(db: Session, user: User) -> int:
    """이 유저가 걸 수 있는 최대 참가비.

    한 사이클도 겪어보지 않은 유저가 4만원을 거는 것은 동기부여가 아니라
    환불 요구를 만드는 길이다. 한 번 완주하면 풀린다.
    """
    completed = db.query(Challenge).filter_by(user_id=user.id, status="completed").count()
    if completed:
        return settings.max_entry_amount
    return settings.first_challenge_max_entry


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
    # 첫 챌린지 상한은 크레딧 참가에만 건다. IAP는 이미 결제가 끝난 뒤에
    # 웹훅이 오므로, 거기서 거절하면 유저가 돈만 내고 아무것도 못 받는다.
    if paid_with == "credit" and spec.price > entry_limit(db, user):
        raise EntryTooLargeForFirstChallenge()
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


def claw_back(db: Session, user: User, challenge: Challenge) -> int:
    """환불된 챌린지가 지급한 크레딧을 회수한다.

    이미 써버린 크레딧은 회수할 수 없으므로 잔액에서 뺄 수 있는 만큼만 뺀다.
    부족분은 로그로 남긴다 — 음수 잔액을 만들면 그 유저는 다시는 아무것도
    못 사게 되고, 그건 회수가 아니라 계정 파괴다.
    """
    granted = sum(
        row.delta for row in db.query(CreditLedger).filter(
            CreditLedger.user_id == user.id,
            CreditLedger.reason.in_(("payback", "bonus")),
            CreditLedger.ref_id.in_(
                db.query(DailyRecord.id).filter(
                    DailyRecord.challenge_id == challenge.id)
            ) | (CreditLedger.ref_id == challenge.id),
        )
    )
    taken = min(granted, user.credit_balance)
    if taken:
        move(db, user, -taken, "refund", challenge.id)
    if taken < granted:
        logger.warning(
            "환불 회수 부족 user=%s challenge=%s 지급=%d 회수=%d",
            user.id, challenge.id, granted, taken,
        )
    challenge.status = "refunded"
    user.refund_count += 1
    return taken
