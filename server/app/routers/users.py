from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import GoalIn, PushTokenIn, UserOut
from app.security import get_current_user

router = APIRouter(prefix="/users/me", tags=["users"])


@router.get("", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/goal", response_model=UserOut)
def change_goal(
    body: GoalIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    """변경은 다음 04:00 정산 직후에 적용된다(Task 15). 즉시 반영하지 않는다."""
    user.pending_goal_minutes = body.minutes
    db.commit()
    return user


@router.put("/push-token", status_code=status.HTTP_204_NO_CONTENT)
def set_push_token(
    body: PushTokenIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    user.expo_push_token = body.token
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
