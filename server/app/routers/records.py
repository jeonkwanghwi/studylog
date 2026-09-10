from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.credits import move
from app.db import get_db
from app.models import DailyRecord, User
from app.schemas import DailyRecordOut
from app.security import get_current_user
from app.time_utils import now_utc

router = APIRouter(prefix="/records", tags=["records"])


@router.get("/me", response_model=list[DailyRecordOut])
def my_records(
    limit: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DailyRecord]:
    return (db.query(DailyRecord).filter_by(user_id=user.id)
              .order_by(DailyRecord.date.desc()).limit(limit).all())


@router.post("/{record_id}/restore", response_model=DailyRecordOut)
def restore_streak(
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DailyRecord:
    """끊긴 streak를 되산다. 크레딧 2,000원, 정산 후 24시간 이내."""
    record = (db.query(DailyRecord)
                .filter_by(id=record_id, user_id=user.id).one_or_none())
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "기록을 찾을 수 없습니다")
    if record.result != "failed":
        raise HTTPException(status.HTTP_409_CONFLICT, "실패한 날만 복구할 수 있습니다")

    deadline = record.settled_at + timedelta(hours=settings.restore_window_hours)
    if now_utc() > deadline:
        raise HTTPException(status.HTTP_409_CONFLICT, "복구 가능 시간이 지났습니다")

    cost = settings.restore_credit_cost
    if user.credit_balance < cost:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED,
                            f"크레딧 {cost}원이 필요합니다")

    previous = (db.query(DailyRecord)
                  .filter(DailyRecord.user_id == user.id,
                          DailyRecord.date < record.date)
                  .order_by(DailyRecord.date.desc()).first())

    move(db, user, -cost, "restore", record.id)
    user.streak_count = (previous.streak_snapshot if previous else 0) + 1
    record.result = "passed"
    record.streak_snapshot = user.streak_count
    # payback_amount 는 0으로 남긴다 — 되사는 것은 연속 기록이지 그날의 성과가 아니다
    db.commit()
    return record
