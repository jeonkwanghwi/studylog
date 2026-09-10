import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from app import notifications
from app.config import settings
from app.models import StudySession, User
from app.notifications import Notification
from app.time_utils import now_utc

logger = logging.getLogger(__name__)


def warn_stale_sessions(db: Session) -> int:
    """회수 30분 전에 한 번만 알린다."""
    now = now_utc()
    warn_before = now - timedelta(minutes=settings.session_warn_minutes)
    expire_before = now - timedelta(minutes=settings.session_max_minutes)

    sessions = (db.query(StudySession)
                  .filter(StudySession.status == "open",
                          StudySession.warned_at.is_(None),
                          StudySession.started_at <= warn_before,
                          StudySession.started_at > expire_before)
                  .all())
    if not sessions:
        return 0

    remaining = settings.session_max_minutes - settings.session_warn_minutes
    tokens = dict(db.query(User.id, User.expo_push_token)
                    .filter(User.id.in_([s.user_id for s in sessions])))

    pushes = []
    for session in sessions:
        session.warned_at = now
        token = tokens.get(session.user_id)
        if token:
            pushes.append(Notification(
                token=token,
                title="공부 세션이 곧 폐기됩니다",
                body=f"{remaining}분 안에 종료 샷을 찍지 않으면 이 세션은 0분으로 처리됩니다.",
            ))

    db.commit()
    notifications.sender(pushes)
    return len(sessions)


def abandon_expired_sessions(db: Session) -> int:
    """4시간이 지나도 종료 샷이 없으면 0분으로 회수한다."""
    expire_before = now_utc() - timedelta(minutes=settings.session_max_minutes)
    sessions = (db.query(StudySession)
                  .filter(StudySession.status == "open",
                          StudySession.started_at <= expire_before)
                  .all())
    for session in sessions:
        session.status = "abandoned"
        session.counted_minutes = 0
    db.commit()
    if sessions:
        logger.info("미종료 세션 회수 %d건", len(sessions))
    return len(sessions)


def sweep(db: Session) -> tuple[int, int]:
    return warn_stale_sessions(db), abandon_expired_sessions(db)
