from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deletion import delete_account
from app.models import User
from app.schemas import GoalIn, NicknameIn, PushTokenIn, UserOut
from app.security import get_current_user
from app.storage import PhotoStorage, get_storage

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
    """변경은 다음 04:00 정산 직후에 적용된다(Task 15). 즉시 반영하지 않는다.

    예외는 온보딩의 첫 설정 하나다. 미루면 첫날은 유저가 고르지도 않은
    기본값 60분으로 돌아간다 — 120분을 고른 사람이 60분 기준으로 정산된다.
    첫 설정에는 미룰 이유도 없다: 아직 오늘 기록도, 낮출 목표도 없다.

    첫 설정인지는 **서버가 자기 상태로만** 판단한다. 앱이 알려주게 두면
    밤에 그 플래그를 달아 보내는 것이 곧 이 규칙의 우회로가 된다.
    """
    if not user.goal_initialized:
        user.daily_goal_minutes = body.minutes
        user.pending_goal_minutes = None
        user.goal_initialized = True
    else:
        user.pending_goal_minutes = body.minutes
    db.commit()
    return user


@router.patch("/nickname", response_model=UserOut)
def change_nickname(
    body: NicknameIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    """목표와 달리 즉시 반영한다 — 이름은 정산과 아무 상관이 없다."""
    nickname = body.nickname.strip()
    if not nickname:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "닉네임을 입력해주세요")
    user.nickname = nickname
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


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
) -> Response:
    """회원 탈퇴. 이 버튼 말고는 계정이 사라지는 길이 없다.

    대상은 **토큰이 가리키는 사람 하나뿐**이다. 경로에도 본문에도 누구를
    지울지 적는 자리가 없으므로, 남의 계정을 지우는 요청을 만들 수 없다.

    되돌릴 수 없다는 안내와 확인은 앱이 맡는다. 서버까지 온 요청은 이미
    확인을 거친 것으로 본다 — 서버가 한 번 더 묻는 왕복을 두면, 그
    '확인 완료' 신호 자체가 우회로가 된다.
    """
    delete_account(db, user, storage)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
