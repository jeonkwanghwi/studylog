from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.domain import generate_invite_code
from app.models import Group, Membership, User
from app.schemas import GroupCreateIn, GroupJoinIn, GroupOut
from app.security import get_current_user

router = APIRouter(prefix="/groups", tags=["groups"])


def _ensure_membership(db: Session, user_id: str, group_id: str) -> None:
    exists = db.query(Membership).filter_by(user_id=user_id, group_id=group_id).count()
    if not exists:
        db.add(Membership(user_id=user_id, group_id=group_id))


@router.post("", response_model=GroupOut)
def create_group(
    body: GroupCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Group:
    for _ in range(10):
        code = generate_invite_code()
        if not db.query(Group).filter_by(invite_code=code).count():
            break
    else:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "초대코드 생성에 실패했습니다")

    group = Group(name=body.name, invite_code=code, owner_id=user.id)
    db.add(group)
    db.flush()
    _ensure_membership(db, user.id, group.id)
    db.commit()
    return group


@router.post("/join", response_model=GroupOut)
def join_group(
    body: GroupJoinIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Group:
    group = db.query(Group).filter_by(invite_code=body.invite_code.upper()).one_or_none()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "없는 초대코드입니다")

    _ensure_membership(db, user.id, group.id)
    db.commit()
    return group


@router.get("", response_model=list[GroupOut])
def my_groups(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Group]:
    return (db.query(Group)
              .join(Membership, Membership.group_id == Group.id)
              .filter(Membership.user_id == user.id)
              .all())
