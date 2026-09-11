from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.judge.base import JudgeProvider, get_judge, is_pass, judge_photo
from app.models import DailyRecord, Photo, StudySession, User, Verdict
from app.routers.sessions import _open_session, close_session
from app.schemas import AppealIn, JudgeResultOut, SessionOut
from app.security import get_current_user
from app.storage import PhotoStorage, get_storage
from app.time_utils import now_utc, study_day

router = APIRouter(tags=["photos"])


@router.post("/photos/{photo_id}/appeal", response_model=JudgeResultOut)
async def appeal_photo(
    photo_id: str,
    body: AppealIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
    judge: JudgeProvider = Depends(get_judge),
) -> JudgeResultOut:
    photo = (db.query(Photo).filter_by(id=photo_id, user_id=user.id).one_or_none())
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사진을 찾을 수 없습니다")
    if photo.status != "fail":
        raise HTTPException(status.HTTP_409_CONFLICT, "거절된 사진만 이의제기할 수 있습니다")
    if db.query(Verdict).filter_by(photo_id=photo.id, attempt=2).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "이의제기는 한 번만 가능합니다")

    day = study_day(photo.received_at)
    if db.query(DailyRecord).filter_by(user_id=user.id, date=day).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 정산된 날입니다")

    # 통과시켜도 반영할 세션이 없으면 판정 전에 막는다. 그러지 않으면 AI 호출을
    # 낭비하고, 단 한 번뿐인 이의제기를 아무 효과 없이 소모시킨다.
    session = _open_session(db, user.id)
    if photo.kind == "start" and session is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 진행 중인 세션이 있습니다")
    if photo.kind == "end" and session is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 종료된 세션입니다")

    rejudged_at = now_utc()
    verdict = await judge_photo(judge, storage.get(photo.s3_key), photo.activity, body.text)
    ok = is_pass(verdict, settings.judge_fail_confidence)

    db.add(Verdict(photo_id=photo.id, attempt=2, appeal_text=body.text,
                   provider=judge.name, model=judge.model,
                   decision=verdict.decision, confidence=verdict.confidence,
                   reason=verdict.reason, raw_json=verdict.raw))

    session = None
    if ok:
        photo.status = "pass"
        session = _apply_passed_appeal(db, user, photo, rejudged_at)
    db.commit()

    return JudgeResultOut(
        result="pass" if ok else "fail",
        photo_id=photo.id,
        reason=verdict.reason,
        session=SessionOut.model_validate(session) if session else None,
    )


def _apply_passed_appeal(
    db: Session, user: User, photo: Photo, rejudged_at
) -> StudySession | None:
    """이의제기가 만드는 시각은 항상 유저에게 불리한 쪽으로 잡는다.

    시작 샷에 최초 수신 시각을 쓰면 "찍어두고 놀다가 이의제기"로 시간을 벌 수 있고,
    종료 샷에 재판정 시각을 쓰면 이의제기를 오래 끌수록 시간이 늘어난다.
    """
    if photo.kind == "start":
        if db.query(StudySession).filter_by(user_id=user.id, status="open").count():
            return None
        session = StudySession(user_id=user.id, start_photo_id=photo.id,
                               activity=photo.activity,
                               started_at=rejudged_at, status="open")
        db.add(session)
        db.flush()
        return session

    session = (db.query(StudySession)
                 .filter_by(user_id=user.id, status="open")
                 .one_or_none())
    if session is None:
        return None
    close_session(session, photo)          # ended_at = photo.received_at
    return session
