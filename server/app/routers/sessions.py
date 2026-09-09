import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.judge.base import JudgeProvider, get_judge, is_pass, judge_photo
from app.models import Photo, StudySession, User, Verdict
from app.schemas import JudgeResultOut, SessionOut
from app.security import get_current_user
from app.storage import PhotoStorage, get_storage, photo_key, process_image
from app.time_utils import now_utc

router = APIRouter(tags=["sessions"])


async def ingest_photo(
    db: Session, user: User, kind: str, image: bytes,
    storage: PhotoStorage, judge: JudgeProvider, received_at,
    attempt: int = 1, appeal_text: str | None = None,
) -> tuple[Photo, bool]:
    """사진을 저장하고 판정한다. (photo, 통과 여부)를 돌려준다."""
    processed = process_image(image)
    photo_id = str(uuid.uuid4())
    key = photo_key(user.id, photo_id)
    storage.put(key, processed.jpeg)

    photo = Photo(id=photo_id, user_id=user.id, kind=kind, s3_key=key,
                  phash=processed.phash, exif_taken_at=processed.taken_at,
                  received_at=received_at, status="pass")
    db.add(photo)

    verdict = await judge_photo(judge, processed.jpeg, appeal_text)
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


@router.post("/sessions/start", response_model=JudgeResultOut)
async def start_session(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    storage: PhotoStorage = Depends(get_storage),
    judge: JudgeProvider = Depends(get_judge),
) -> JudgeResultOut:
    received_at = now_utc()          # 타이머 기준은 요청이 도착한 시각이다
    if _open_session(db, user.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 진행 중인 세션이 있습니다")

    photo, ok = await ingest_photo(
        db, user, "start", await image.read(), storage, judge, received_at
    )
    session = None
    if ok:
        session = StudySession(user_id=user.id, start_photo_id=photo.id,
                               started_at=photo.received_at, status="open")
        db.add(session)
    db.commit()

    return JudgeResultOut(
        result="pass" if ok else "fail",
        photo_id=photo.id,
        reason=_last_reason(db, photo.id),
        session=SessionOut.model_validate(session) if session else None,
    )


@router.get("/sessions/current", response_model=SessionOut | None)
def current_session(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> StudySession | None:
    return _open_session(db, user.id)
