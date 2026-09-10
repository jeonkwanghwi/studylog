from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.credits import active_challenge, start_challenge
from app.db import get_db
from app.models import Challenge, User
from app.schemas import ChallengeJoinIn, ChallengeOut
from app.security import get_current_user
from app.time_utils import now_utc, study_day

router = APIRouter(prefix="/challenges", tags=["challenges"])


@router.post("", response_model=ChallengeOut)
def join_with_credit(
    body: ChallengeJoinIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Challenge:
    """크레딧으로 재참가한다. 현금 결제는 IAP 웹훅으로만 들어온다."""
    try:
        challenge = start_challenge(db, user, body.product_id, "credit",
                                    study_day(now_utc()))
    except ValueError as exc:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, str(exc))
    db.commit()
    return challenge


@router.get("/current", response_model=ChallengeOut | None)
def current(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Challenge | None:
    return active_challenge(db, user.id)
