import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.credits import ChallengeAlreadyActive, start_challenge
from app.db import get_db
from app.domain import CHALLENGE_PRODUCTS, GRANTING_EVENT_TYPES
from app.models import Purchase, User
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
    if event.get("type") not in GRANTING_EVENT_TYPES:
        return {"started": False}

    event_id = str(event.get("id"))
    if db.query(Purchase).filter_by(revenuecat_event_id=event_id).count():
        return {"started": False}      # 웹훅은 재전송된다. 멱등이어야 한다

    # 아래 두 경우는 200으로 확정하면 안 된다. 200은 RevenueCat에게 "처리 끝났으니
    # 그만 보내라"는 뜻인데, 돈은 이미 애플·구글이 걷어갔다. 서버가 아직 모르는
    # 신규 SKU를 앱이 먼저 출시한 상황이면 기록 없이 돈만 걷힌다. 5xx로 답해서
    # 서버가 따라잡을 때까지 재시도를 받는다.
    spec = CHALLENGE_PRODUCTS.get(event.get("product_id"))
    if spec is None:
        logger.error("알 수 없는 상품으로 결제됨 — 재시도 유도: %s",
                     event.get("product_id"))
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "unknown product")

    user = db.get(User, str(event.get("app_user_id")))
    if user is None:
        logger.error("알 수 없는 유저의 결제 — 재시도 유도: %s",
                     event.get("app_user_id"))
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "unknown user")

    try:
        challenge = start_challenge(db, user, event["product_id"], "iap",
                                    study_day(now_utc()))
    except ChallengeAlreadyActive:
        # 이건 진짜 종결 상태다. 돈은 실제로 걷혔으니 영수증은 남기되
        # 두 번째 챌린지는 열지 않는다.
        logger.warning("활성 챌린지가 있어 두 번째를 열지 않음 user=%s", user.id)
        db.add(Purchase(user_id=user.id, revenuecat_event_id=event_id,
                        product_id=event["product_id"], amount=spec.price,
                        challenge_id=None))
        db.commit()
        return {"started": False}

    db.add(Purchase(user_id=user.id, revenuecat_event_id=event_id,
                    product_id=event["product_id"], amount=spec.price,
                    challenge_id=challenge.id))
    db.commit()
    return {"started": True}
