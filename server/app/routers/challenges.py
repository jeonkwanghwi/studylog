from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.credits import (ChallengeAlreadyActive, InsufficientCredit,
                         UnknownProduct, active_challenge, start_challenge)
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
    except UnknownProduct:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "없는 상품입니다")
    except ChallengeAlreadyActive:
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 진행 중인 챌린지가 있습니다")
    except InsufficientCredit:
        # 402는 "결제하면 해결된다"는 신호다. 잔액 부족일 때만 써야
        # 앱이 결제창을 띄웠는데 아무것도 못 받는 상황이 안 생긴다.
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "크레딧이 부족합니다")
    db.commit()
    return challenge


@router.get("/current", response_model=ChallengeOut | None)
def current(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Challenge | None:
    return active_challenge(db, user.id)
