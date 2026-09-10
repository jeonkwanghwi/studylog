import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.credits import ChallengeAlreadyActive, claw_back, entry_limit, start_challenge
from app.db import get_db
from app.domain import CHALLENGE_PRODUCTS, GRANTING_EVENT_TYPES, REFUND_EVENT_TYPES
from app.models import Challenge, Purchase, User
from app.time_utils import now_utc, study_day

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])


@router.post("/webhooks/revenuecat")
def revenuecat(
    payload: dict,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    expected = f"Bearer {settings.revenuecat_webhook_secret}"
    if not hmac.compare_digest(authorization, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid webhook secret")

    event = payload.get("event", {})
    if event.get("type") in REFUND_EVENT_TYPES:
        return _handle_refund(db, event)

    if event.get("type") not in GRANTING_EVENT_TYPES:
        return {"started": False}

    event_id = str(event.get("id"))
    if db.query(Purchase).filter_by(revenuecat_event_id=event_id).count():
        return {"started": False}      # 웹훅은 재전송된다. 멱등이어야 한다

    # 모르는 상품은 200으로 확정하면 안 된다. 200은 RevenueCat에게 "처리 끝났으니
    # 그만 보내라"는 뜻인데, 돈은 이미 애플·구글이 걷어갔다. 서버가 아직 모르는
    # 신규 SKU를 앱이 먼저 출시한 상황이면 기록 없이 돈만 걷힌다. 5xx로 답해서
    # 서버가 따라잡을 때까지 재시도를 받는다 — 이 경우는 시간이 지나면 실제로
    # 해소된다. 모르는 유저는 다르다(아래 참고): 그 id는 영원히 안 풀리므로
    # 재시도를 유도하는 5xx가 의미 없다.
    spec = CHALLENGE_PRODUCTS.get(event.get("product_id"))
    if spec is None:
        logger.error("알 수 없는 상품으로 결제됨 — 재시도 유도: %s",
                     event.get("product_id"))
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "unknown product")

    user = db.get(User, str(event.get("app_user_id")))
    if user is None:
        # 상품과 달리 이 id는 앞으로도 절대 풀리지 않는다 — 재시도를 유도해봐야
        # 소용없다. ChallengeAlreadyActive와 같은 패턴으로 영수증만 남기고 200.
        logger.error("알 수 없는 유저의 결제 user=%s transaction_id=%s",
                     event.get("app_user_id"), event.get("transaction_id"))
        db.add(Purchase(user_id=None, revenuecat_event_id=event_id,
                        product_id=event["product_id"], amount=spec.price,
                        challenge_id=None,
                        transaction_id=str(event.get("transaction_id"))))
        db.commit()
        return {"started": False}

    # price_in_purchased_currency 를 우선한다 — price 는 RevenueCat이 USD로
    # 환산한 값이라, 원화 spec.price와 그대로 비교하면 정상 결제마다 불일치가
    # 찍혀 신호가 묻힌다. 두 필드 다 없으면 검사를 건너뛴다.
    charged = event.get("price_in_purchased_currency", event.get("price"))
    if charged is not None and abs(float(charged) - spec.price) > 1:
        logger.error("결제 금액 불일치 user=%s product=%s 기대=%d 실제=%s",
                     user.id, event["product_id"], spec.price, charged)

    if spec.price > entry_limit(db, user):
        # 상한을 넘겼지만 돈은 이미 걷혔다. 인정하고 로그만 남긴다 —
        # 여기서 거절하면 유저가 결제하고 아무것도 못 받는다.
        logger.warning("첫 챌린지 상한 초과 결제 user=%s product=%s",
                       user.id, event["product_id"])

    try:
        challenge = start_challenge(db, user, event["product_id"], "iap",
                                    study_day(now_utc()))
    except ChallengeAlreadyActive:
        # 이건 진짜 종결 상태다. 돈은 실제로 걷혔으니 영수증은 남기되
        # 두 번째 챌린지는 열지 않는다.
        logger.warning("활성 챌린지가 있어 두 번째를 열지 않음 user=%s", user.id)
        db.add(Purchase(user_id=user.id, revenuecat_event_id=event_id,
                        product_id=event["product_id"], amount=spec.price,
                        challenge_id=None,
                        transaction_id=str(event.get("transaction_id"))))
        db.commit()
        return {"started": False}

    db.add(Purchase(user_id=user.id, revenuecat_event_id=event_id,
                    product_id=event["product_id"], amount=spec.price,
                    challenge_id=challenge.id,
                    transaction_id=str(event.get("transaction_id"))))
    db.commit()
    return {"started": True}


def _handle_refund(db: Session, event: dict) -> dict[str, bool]:
    """환불은 곧 참가 취소다. 챌린지를 닫고 그 챌린지가 준 크레딧을 회수한다."""
    txn = str(event.get("transaction_id"))
    purchase = (db.query(Purchase)
                  .filter_by(transaction_id=txn)
                  .order_by(Purchase.created_at.desc()).first())
    if purchase is None or purchase.challenge_id is None:
        # 모르는 거래다. 재시도해도 달라지지 않으므로 200 으로 닫는다.
        logger.error("환불 대상을 찾지 못함 transaction_id=%s", txn)
        return {"started": False}

    # FOR UPDATE로 챌린지 행을 잠근다. 같은 거래의 환불이 동시에 두 번 도착하면
    # 둘 다 status=="active"를 읽고 둘 다 회수를 시도할 수 있다 — 락을 걸어
    # 두 번째가 첫 번째의 커밋(challenge.status=="refunded") 뒤에 읽게 만든다.
    challenge = (db.query(Challenge).populate_existing()
                   .filter_by(id=purchase.challenge_id)
                   .with_for_update().one_or_none())
    if challenge is None or challenge.status == "refunded":
        return {"started": False}          # 재전송. 두 번 회수하지 않는다

    user = db.get(User, purchase.user_id)
    claw_back(db, user, challenge)
    db.commit()
    return {"started": False}
