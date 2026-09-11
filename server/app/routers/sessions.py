import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import notifications
from app.config import settings
from app.db import get_db
from app.domain import counted_minutes
from app.judge.base import JudgeProvider, get_judge, is_pass, judge_photo
from app.models import Photo, StudySession, User, Verdict
from app.notifications import Notification
from app.schemas import JudgeResultOut, SessionOut
from app.security import get_current_user
from app.storage import PhotoStorage, get_storage, photo_key, process_image
from app.time_utils import now_utc

router = APIRouter(tags=["sessions"])


async def ingest_photo(
    db: Session, user: User, kind: str, image: bytes,
    storage: PhotoStorage, judge: JudgeProvider, received_at, activity: str,
    attempt: int = 1, appeal_text: str | None = None,
) -> tuple[Photo, bool]:
    """사진을 저장하고 판정한다. (photo, 통과 여부)를 돌려준다."""
    processed = process_image(image)
    photo_id = str(uuid.uuid4())
    key = photo_key(user.id, photo_id)
    storage.put(key, processed.jpeg)

    photo = Photo(id=photo_id, user_id=user.id, kind=kind, s3_key=key,
                  activity=activity,
                  phash=processed.phash, exif_taken_at=processed.taken_at,
                  received_at=received_at, status="pass")
    db.add(photo)

    verdict = await judge_photo(judge, processed.jpeg, activity, appeal_text)
    ok = is_pass(verdict, settings.judge_fail_confidence)
    photo.status = "pass" if ok else "fail"

    db.add(Verdict(photo_id=photo.id, attempt=attempt, appeal_text=appeal_text,
                   provider=judge.name, model=judge.model,
                   decision=verdict.decision, confidence=verdict.confidence,
                   reason=verdict.reason, raw_json=verdict.raw))
    db.flush()
    return photo, ok


def _open_session(db: Session, user_id: str) -> StudySession | None:
    return (db.query(StudySession)
              .filter_by(user_id=user_id, status="open")
              .one_or_none())


def _last_reason(db: Session, photo_id: str) -> str:
    row = (db.query(Verdict).filter_by(photo_id=photo_id)
             .order_by(Verdict.attempt.desc()).first())
    return row.reason if row else ""


def notify_rejection(user: User, reason: str) -> None:
    """앱을 닫은 사이에 거절되면 세션이 통째로 날아간다. 즉시 알린다."""
    if user.expo_push_token:
        notifications.sender([Notification(
            token=user.expo_push_token, title="인증이 거절됐습니다", body=reason,
        )])


@router.post("/sessions/start", response_model=JudgeResultOut)
async def start_session(
    activity: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
    judge: JudgeProvider = Depends(get_judge),
) -> JudgeResultOut:
    activity = activity.strip()
    if not activity or len(activity) > 100:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "활동 선언은 1자 이상 100자 이하여야 합니다"
        )

    received_at = now_utc()          # 타이머 기준은 요청이 도착한 시각이다
    if _open_session(db, user.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 진행 중인 세션이 있습니다")

    photo, ok = await ingest_photo(
        db, user, "start", await image.read(), storage, judge, received_at, activity
    )
    session = None
    if ok:
        session = StudySession(user_id=user.id, start_photo_id=photo.id,
                               activity=activity,
                               started_at=photo.received_at, status="open")
        db.add(session)
    db.commit()

    reason = _last_reason(db, photo.id)
    if not ok:
        notify_rejection(user, reason)

    return JudgeResultOut(
        result="pass" if ok else "fail",
        photo_id=photo.id,
        reason=reason,
        session=SessionOut.model_validate(session) if session else None,
    )


@router.get("/sessions/current", response_model=SessionOut | None)
def current_session(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> StudySession | None:
    return _open_session(db, user.id)


@router.post("/sessions/{session_id}/end", response_model=JudgeResultOut)
async def end_session(
    session_id: str,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
    judge: JudgeProvider = Depends(get_judge),
) -> JudgeResultOut:
    received_at = now_utc()          # 타이머 기준은 요청이 도착한 시각이다
    session = (db.query(StudySession)
                 .filter_by(id=session_id, user_id=user.id, status="open")
                 .one_or_none())
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "진행 중인 세션이 아닙니다")

    photo, ok = await ingest_photo(
        db, user, "end", await image.read(), storage, judge, received_at,
        session.activity,
    )
    if ok:
        close_session(session, photo)
    db.commit()

    reason = _last_reason(db, photo.id)
    if not ok:
        notify_rejection(user, reason)

    return JudgeResultOut(
        result="pass" if ok else "fail",
        photo_id=photo.id,
        reason=reason,
        session=SessionOut.model_validate(session) if ok else None,
    )


def close_session(session: StudySession, end_photo: Photo) -> None:
    """종료 샷이 통과했을 때 세션을 닫는다. 이의제기(Task 10)도 이걸 쓴다."""
    session.end_photo_id = end_photo.id
    session.ended_at = end_photo.received_at
    session.counted_minutes = counted_minutes(
        session.started_at, end_photo.received_at, settings.session_max_minutes
    )
    session.status = "closed"
