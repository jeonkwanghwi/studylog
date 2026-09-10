import logging
from datetime import date as Date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.credits import active_challenge, move
from app.domain import settle_outcome
from app.models import DailyRecord, StudySession, User
from app.time_utils import day_bounds, now_utc

logger = logging.getLogger(__name__)


def settle_day(db: Session, day: Date) -> int:
    """day의 daily_record를 유저마다 하나씩 만든다. 이미 있으면 건너뛴다.

    그룹과 무관하다 — 목표·streak·크레딧이 전부 유저 단위이기 때문이다.
    """
    start, end = day_bounds(day)

    minutes = dict(
        db.query(StudySession.user_id, func.sum(StudySession.counted_minutes))
          .filter(StudySession.status == "closed",
                  StudySession.started_at >= start,
                  StudySession.started_at < end)
          .group_by(StudySession.user_id)
          .all()
    )
    already = {row[0] for row in
               db.query(DailyRecord.user_id).filter(DailyRecord.date == day)}

    created = 0
    for user in db.query(User).all():
        if user.id in already:
            continue

        challenge = active_challenge(db, user.id)
        # 활성이라는 것만으로는 부족하다. 배치가 하루 밀렸다가 따라잡을 때
        # 챌린지 시작 전날이 정산되면, 기간 밖인데도 페이백이 나가고 그날이
        # 완주 판정에도 끼어든다.
        in_window = (challenge is not None
                     and challenge.started_on <= day <= challenge.ends_on)

        total = int(minutes.get(user.id) or 0)
        outcome = settle_outcome(
            total=total, goal=user.daily_goal_minutes, streak=user.streak_count,
            daily_payback=challenge.daily_payback if in_window else 0,
        )
        user.streak_count = outcome.new_streak

        record = DailyRecord(
            user_id=user.id, date=day, total_minutes=total,
            goal_minutes=user.daily_goal_minutes, result=outcome.result,
            challenge_id=challenge.id if in_window else None,
            payback_amount=outcome.payback,
            streak_snapshot=outcome.new_streak, settled_at=now_utc(),
        )
        db.add(record)
        db.flush()

        if outcome.payback:
            move(db, user, outcome.payback, "payback", record.id)

        if challenge is not None and day >= challenge.ends_on:
            _close_challenge(db, user, challenge)

        if user.pending_goal_minutes is not None:
            user.daily_goal_minutes = user.pending_goal_minutes
            user.pending_goal_minutes = None

        created += 1

    db.commit()
    logger.info("정산 완료 day=%s records=%d", day, created)
    return created


def _close_challenge(db: Session, user: User, challenge) -> None:
    """챌린지를 닫는다. 전일 달성이면 완주 보너스를 얹는다.

    보너스는 `paid_with == "iap"`인 챌린지에만 붙어 있다(credits.start_challenge).
    크레딧 참가에도 주면 완주자가 크레딧을 무한 증식시킨다.
    """
    challenge.status = "completed"
    if not challenge.completion_bonus:
        return

    # 실패한 날이 없는 것만으로는 부족하다. 정산이 누락된 날이 있으면
    # 그날은 실패로도 잡히지 않아서, 빈 구멍이 있는 런에 보너스가 나간다.
    results = [r.result for r in db.query(DailyRecord)
                                  .filter(DailyRecord.challenge_id == challenge.id)]
    perfect = (len(results) == challenge.total_days
               and "failed" not in results)
    if perfect:
        move(db, user, challenge.completion_bonus, "bonus", challenge.id)
