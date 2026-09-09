from datetime import timedelta

from app.judge.base import Verdict
from app.models import DailyRecord, Photo, StudySession, Verdict as VerdictRow
from app.time_utils import now_utc, study_day


def start(client, auth, jpeg):
    return client.post("/sessions/start", headers=auth,
                       files={"image": ("s.jpg", jpeg, "image/jpeg")}).json()


def appeal(client, auth, photo_id, text="태블릿으로 인강 듣는 중입니다"):
    return client.post(f"/photos/{photo_id}/appeal", headers=auth, json={"text": text})


def test_successful_appeal_on_a_start_shot_opens_a_session(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "화면만 보입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]

    judge.verdict = Verdict("pass", 0.85, "인강 화면입니다.", {})
    body = appeal(client, auth, photo_id).json()

    assert body["result"] == "pass"
    assert body["session"]["status"] == "open"
    assert db.get(Photo, photo_id).status == "pass"


def test_start_shot_appeal_uses_the_rejudge_time_not_the_original(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "화면만 보입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]

    photo = db.get(Photo, photo_id)
    photo.received_at = photo.received_at - timedelta(hours=3)
    db.commit()

    judge.verdict = Verdict("pass", 0.85, "인강 화면입니다.", {})
    appeal(client, auth, photo_id)

    session = db.query(StudySession).one()
    assert session.started_at > photo.received_at + timedelta(hours=2)


def test_end_shot_appeal_uses_the_original_receive_time(client, auth, jpeg, db, judge):
    session_id = start(client, auth, jpeg)["session"]["id"]
    session = db.get(StudySession, session_id)
    session.started_at = session.started_at - timedelta(minutes=60)
    db.commit()

    judge.verdict = Verdict("fail", 0.95, "음식입니다.", {})
    end_photo_id = client.post(f"/sessions/{session_id}/end", headers=auth,
                               files={"image": ("e.jpg", jpeg, "image/jpeg")}
                               ).json()["photo_id"]

    end_photo = db.get(Photo, end_photo_id)
    original = end_photo.received_at

    judge.verdict = Verdict("pass", 0.85, "노트 필기입니다.", {})
    body = appeal(client, auth, end_photo_id).json()

    db.refresh(session)
    assert session.status == "closed"
    assert session.ended_at == original
    assert body["session"]["counted_minutes"] == 60


def test_appeal_records_attempt_two_with_the_text(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]

    judge.verdict = Verdict("pass", 0.8, "코딩 화면입니다.", {})
    appeal(client, auth, photo_id, text="파이썬 코딩 중입니다")

    rows = {r.attempt: r for r in db.query(VerdictRow).filter_by(photo_id=photo_id)}
    assert rows[1].appeal_text is None
    assert rows[2].appeal_text == "파이썬 코딩 중입니다"
    assert rows[2].decision == "pass"


def test_second_appeal_is_rejected(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]
    appeal(client, auth, photo_id)
    assert appeal(client, auth, photo_id).status_code == 409


def test_cannot_appeal_a_passing_photo(client, auth, jpeg):
    photo_id = start(client, auth, jpeg)["photo_id"]
    assert appeal(client, auth, photo_id).status_code == 409


def test_cannot_appeal_after_the_day_is_settled(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]
    photo = db.get(Photo, photo_id)

    db.add(DailyRecord(user_id=photo.user_id, date=study_day(photo.received_at),
                       total_minutes=0, goal_minutes=60, result="failed",
                       streak_snapshot=0, settled_at=now_utc()))
    db.commit()

    assert appeal(client, auth, photo_id).status_code == 409


def test_appeal_on_a_start_shot_is_rejected_when_another_session_is_open(
    client, auth, jpeg, db, judge
):
    """통과시켜도 반영할 데가 없다. AI를 부르기 전에 막아야 이의제기가 보존된다."""
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    stale_photo_id = start(client, auth, jpeg)["photo_id"]

    judge.verdict = Verdict("pass", 0.9, "책상입니다.", {})
    start(client, auth, jpeg)                      # 다른 세션이 열린다

    r = appeal(client, auth, stale_photo_id)
    assert r.status_code == 409
    assert db.query(VerdictRow).filter_by(photo_id=stale_photo_id, attempt=2).count() == 0
    assert db.query(StudySession).count() == 1


def test_appeal_on_an_end_shot_is_rejected_when_the_session_already_closed(
    client, auth, jpeg, db, judge
):
    session_id = start(client, auth, jpeg)["session"]["id"]

    judge.verdict = Verdict("fail", 0.95, "음식입니다.", {})
    stale_end_id = client.post(f"/sessions/{session_id}/end", headers=auth,
                               files={"image": ("e.jpg", jpeg, "image/jpeg")}
                               ).json()["photo_id"]

    judge.verdict = Verdict("pass", 0.9, "노트입니다.", {})
    client.post(f"/sessions/{session_id}/end", headers=auth,
                files={"image": ("e2.jpg", jpeg, "image/jpeg")})   # 세션이 닫힌다

    r = appeal(client, auth, stale_end_id)
    assert r.status_code == 409
    assert db.query(VerdictRow).filter_by(photo_id=stale_end_id, attempt=2).count() == 0


def test_failed_appeal_changes_nothing(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    photo_id = start(client, auth, jpeg)["photo_id"]

    judge.verdict = Verdict("fail", 0.9, "여전히 게임입니다.", {})
    body = appeal(client, auth, photo_id).json()

    assert body["result"] == "fail"
    assert db.get(Photo, photo_id).status == "fail"
    assert db.query(StudySession).count() == 0
