from datetime import date as Date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DailyRecord, Membership, Photo, StudySession, User
from app.schemas import FeedItemOut, FeedPhotoOut
from app.security import get_current_user
from app.storage import PhotoStorage, get_storage
from app.time_utils import day_bounds, now_utc, study_day

router = APIRouter(tags=["feed"])


@router.get("/groups/{group_id}/feed", response_model=list[FeedItemOut])
def group_feed(
    group_id: str,
    date: Date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
) -> list[FeedItemOut]:
    if not db.query(Membership).filter_by(user_id=user.id, group_id=group_id).count():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "그룹원만 볼 수 있습니다")

    day = date or study_day(now_utc())
    start, end = day_bounds(day)

    members = (db.query(User)
                 .join(Membership, Membership.user_id == User.id)
                 .filter(Membership.group_id == group_id)
                 .all())
    member_ids = [m.id for m in members]

    sessions = (db.query(StudySession)
                  .filter(StudySession.user_id.in_(member_ids),
                          StudySession.status == "closed",
                          StudySession.started_at >= start,
                          StudySession.started_at < end)
                  .all())
    records = {r.user_id: r for r in db.query(DailyRecord)
               .filter(DailyRecord.user_id.in_(member_ids), DailyRecord.date == day)}

    photos = (db.query(Photo)
                .filter(Photo.user_id.in_(member_ids),
                        Photo.status == "pass",
                        Photo.received_at >= start,
                        Photo.received_at < end)
                .order_by(Photo.received_at)
                .all())

    items: list[FeedItemOut] = []
    for member in members:
        record = records.get(member.id)
        items.append(FeedItemOut(
            user_id=member.id,
            nickname=member.nickname,
            streak_count=member.streak_count,
            total_minutes=sum(s.counted_minutes for s in sessions
                              if s.user_id == member.id),
            goal_minutes=record.goal_minutes if record else member.daily_goal_minutes,
            result=record.result if record else None,
            photos=[FeedPhotoOut(kind=p.kind, url=storage.url(p.s3_key),
                                 received_at=p.received_at)
                    for p in photos if p.user_id == member.id],
        ))
    return items
