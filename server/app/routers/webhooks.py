import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.credits import start_challenge
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

    spec = CHALLENGE_PRODUCTS.get(event.get("product_id"))
    if spec is None:
        logger.warning("알 수 없는 상품: %s", event.get("product_id"))
        return {"started": False}

    event_id = str(event.get("id"))
    if db.query(Purchase).filter_by(revenuecat_event_id=event_id).count():
        return {"started": False}      # 웹훅은 재전송된다. 멱등이어야 한다

    user = db.get(User, str(event.get("app_user_id")))
    if user is None:
        logger.warning("알 수 없는 유저의 구매: %s", event.get("app_user_id"))
        return {"started": False}

    try:
        challenge = start_challenge(db, user, event["product_id"], "iap",
                                    study_day(now_utc()))
    except ValueError as exc:
        # 활성 챌린지가 이미 있는 경우. 영수증은 남기되 두 번째를 열지 않는다.
        logger.warning("챌린지 생성 실패 user=%s: %s", user.id, exc)
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
