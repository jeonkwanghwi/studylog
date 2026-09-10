from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.credits import (ChallengeAlreadyActive, EntryTooLargeForFirstChallenge,
                         InsufficientCredit, UnknownProduct, active_challenge,
                         entry_limit, start_challenge)
from app.db import get_db
from app.domain import CHALLENGE_PRODUCTS
from app.models import Challenge, User
from app.schemas import ChallengeJoinIn, ChallengeOut, ChallengeProductOut
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
    except EntryTooLargeForFirstChallenge:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "첫 챌린지는 더 작은 금액으로 시작해야 합니다")
    except InsufficientCredit:
        # 402는 "결제하면 해결된다"는 신호다. 잔액 부족일 때만 써야
        # 앱이 결제창을 띄웠는데 아무것도 못 받는 상황이 안 생긴다.
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "크레딧이 부족합니다")
    db.commit()
    return challenge


@router.get("/products", response_model=list[ChallengeProductOut])
def products(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ChallengeProductOut]:
    """이 유저가 지금 참가할 수 있는 상품만 준다.

    첫 챌린지 상한이 유저마다 다르므로 앱이 표를 하드코딩할 수 없다.
    무엇을 보여줄지는 서버가 정한다.
    """
    limit = entry_limit(db, user)
    return [
        ChallengeProductOut(product_id=name, days=spec.days,
                            daily_payback=spec.daily_payback, price=spec.price,
                            completion_bonus=spec.completion_bonus)
        for name, spec in sorted(CHALLENGE_PRODUCTS.items(),
                                 key=lambda kv: (kv[1].days, kv[1].daily_payback))
        if spec.price <= limit
    ]


@router.get("/current", response_model=ChallengeOut | None)
def current(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Challenge | None:
    return active_challenge(db, user.id)
