"""계정 삭제.

이 모듈에는 공개 함수가 하나뿐이고, 그 함수는 **user_id 를 받지 않는다.**
인증을 통과한 `User` 객체만 받는다. 남의 계정을 지목할 인자가 아예 없으니
"실수로 다른 사람을 지웠다"가 구조적으로 불가능하다. 라우터도 마찬가지로
`Depends(get_current_user)` 가 준 객체만 넘긴다 — 경로나 본문에서 대상을
받는 곳은 어디에도 없다.

되돌릴 수 없는 동작이라 관리자용 일괄 삭제나 id 기반 변형을 두지 않는다.
필요해지면 그때 별도로, 다른 이름으로, 다른 인증으로 만든다.
"""

import logging

from sqlalchemy.orm import Session

from app.models import (Challenge, CreditLedger, DailyRecord, Group, Membership,
                        Photo, Purchase, StudySession, User, Verdict)
from app.storage import PhotoStorage

log = logging.getLogger(__name__)


def _hand_over_groups(db: Session, user_id: str) -> None:
    """이 사람이 만든 그룹을 남은 사람에게 넘긴다.

    방장이 나간다고 그룹을 없애면 남은 사람들의 그룹이 같이 사라진다.
    가장 먼저 들어온 사람에게 넘기고, 아무도 없으면 그때 지운다.
    """
    for group in db.query(Group).filter_by(owner_id=user_id).all():
        heir = (db.query(Membership)
                  .filter(Membership.group_id == group.id)
                  .order_by(Membership.joined_at)
                  .first())
        if heir is None:
            db.delete(group)
        else:
            group.owner_id = heir.user_id


def delete_account(db: Session, user: User, storage: PhotoStorage) -> None:
    """이 사람의 계정과 딸린 것을 전부 지운다.

    결제 영수증만 남긴다. 환불·분쟁 대응에 필요해서인데, 그냥 두면 지운
    사람을 도로 가리키게 되므로 **user_id 를 끊어** 누구의 것인지 알 수
    없게 만든다. 개인정보처리방침에 적은 그대로다.

    사진 파일은 DB 커밋이 끝난 뒤에 지운다. 순서를 뒤집으면 트랜잭션이
    실패했을 때 계정은 살아 있는데 사진만 사라진다.
    """
    # 사진은 여러 테이블이 참조한다. 키를 먼저 챙겨두고 마지막에 지운다.
    photos = db.query(Photo).filter_by(user_id=user.id).all()
    photo_ids = [p.id for p in photos]
    s3_keys = [p.s3_key for p in photos]

    if photo_ids:
        (db.query(Verdict)
           .filter(Verdict.photo_id.in_(photo_ids))
           .delete(synchronize_session=False))

    # 세션이 사진을 참조하므로 사진보다 먼저 지운다.
    db.query(StudySession).filter_by(user_id=user.id).delete(synchronize_session=False)
    # 일일 기록이 챌린지를 참조하므로 챌린지보다 먼저 지운다.
    db.query(DailyRecord).filter_by(user_id=user.id).delete(synchronize_session=False)
    db.query(CreditLedger).filter_by(user_id=user.id).delete(synchronize_session=False)
    db.query(Membership).filter_by(user_id=user.id).delete(synchronize_session=False)

    _hand_over_groups(db, user.id)

    # 영수증은 남기되 사람과의 연결을 끊는다. 챌린지도 곧 사라지므로
    # 그 참조도 같이 끊어야 외래키가 깨지지 않는다.
    (db.query(Purchase)
       .filter_by(user_id=user.id)
       .update({"user_id": None, "challenge_id": None}, synchronize_session=False))

    db.query(Challenge).filter_by(user_id=user.id).delete(synchronize_session=False)
    db.query(Photo).filter_by(user_id=user.id).delete(synchronize_session=False)

    db.delete(user)
    db.commit()

    # 여기서 실패해도 계정은 이미 사라졌다. 남은 파일은 photos/<user_id>/
    # 접두사 하나로 다시 지울 수 있도록 그 값을 로그에 남긴다.
    for key in s3_keys:
        try:
            storage.delete(key)
        except Exception:
            log.exception("사진 파일을 지우지 못했습니다. prefix=photos/%s/", user.id)
