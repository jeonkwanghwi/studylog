import logging
from datetime import date as Date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import notifications
from app.config import settings
from app.models import Challenge, CreditLedger, DailyRecord, StudySession, User
from app.notifications import Notification
from app.time_utils import day_bounds, now_utc, study_day

logger = logging.getLogger(__name__)


def remind_shortfall(db: Session) -> int:
    """22:00 cron. 오늘 목표에 못 미친 사람에게만 보낸다."""
    day = study_day(now_utc())
    start, end = day_bounds(day)

    minutes = dict(
        db.query(StudySession.user_id, func.sum(StudySession.counted_minutes))
          .filter(StudySession.status == "closed",
                  StudySession.started_at >= start,
                  StudySession.started_at < end)
          .group_by(StudySession.user_id)
          .all()
    )

    pushes = []
    for user in db.query(User).filter(User.expo_push_token.isnot(None)):
        done = int(minutes.get(user.id) or 0)
        if done >= user.daily_goal_minutes:
            continue
        pushes.append(Notification(
            token=user.expo_push_token,
            title="오늘 목표까지 조금 남았어요",
            body=f"{user.daily_goal_minutes - done}분 더 하면 오늘 인증이 완성됩니다.",
        ))

    notifications.sender(pushes)
    logger.info("마감 리마인드 %d건", len(pushes))
    return len(pushes)


def nudge_restore(db: Session, day: Date) -> int:
    """08:00 cron. 어제 streak가 끊긴 사람에게만 복구를 권한다.

    challenge_id로 조인해 실제 챌린지가 있었던 날만 대상으로 한다 —
    챌린지 없는 실패까지 포함하면 페이백이 0원이었던 사람에게 "돈을 놓쳤다"고
    거짓말하게 된다.
    """
    rows = (db.query(User, DailyRecord, Challenge)
              .join(DailyRecord, DailyRecord.user_id == User.id)
              .join(Challenge, Challenge.id == DailyRecord.challenge_id)
              .filter(DailyRecord.date == day,
                      DailyRecord.result == "failed",
                      User.expo_push_token.isnot(None))
              .all())

    pushes = [
        Notification(
            token=user.expo_push_token,
            title="어제 페이백을 놓쳤어요",
            body=(f"어제 {challenge.daily_payback:,}원을 놓쳤어요. "
                  f"연속 기록도 끊겼습니다. 오늘 안에 크레딧 "
                  f"{settings.restore_credit_cost:,}원으로 되살릴 수 있어요."),
        )
        for user, _, challenge in rows
    ]
    notifications.sender(pushes)
    logger.info("복구 유도 %d건", len(pushes))
    return len(pushes)


def nudge_challenge_end(db: Session, day: Date) -> int:
    """08:00 cron. 어제 끝난 챌린지 완주자에게 총 적립액을 알리고 재참가를 권한다."""
    rows = (db.query(Challenge, User)
              .join(User, User.id == Challenge.user_id)
              .filter(Challenge.status == "completed",
                     Challenge.ends_on == day,
                     User.expo_push_token.isnot(None))
              .all())

    pushes = []
    for challenge, user in rows:
        payback = (db.query(func.sum(DailyRecord.payback_amount))
                     .filter(DailyRecord.challenge_id == challenge.id)
                     .scalar()) or 0
        bonus = (db.query(func.sum(CreditLedger.delta))
                   .filter(CreditLedger.ref_id == challenge.id,
                          CreditLedger.reason == "bonus")
                   .scalar()) or 0
        earned = payback + bonus
        pushes.append(Notification(
            token=user.expo_push_token,
            title="챌린지가 끝났어요",
            body=f"이번 챌린지에서 {earned:,}원을 적립했어요. 다시 도전해보세요!",
        ))

    notifications.sender(pushes)
    logger.info("챌린지 종료 알림 %d건", len(pushes))
    return len(pushes)
