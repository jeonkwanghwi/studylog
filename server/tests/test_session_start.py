from app.judge.base import Verdict
from app.models import Photo, StudySession, Verdict as VerdictRow


def start(client, auth, jpeg):
    return client.post("/sessions/start", headers=auth,
                       files={"image": ("shot.jpg", jpeg, "image/jpeg")})


def test_pass_opens_a_session(client, auth, jpeg, db):
    r = start(client, auth, jpeg)
    assert r.status_code == 200
    body = r.json()
    assert body["result"] == "pass"
    assert body["session"]["status"] == "open"

    session = db.query(StudySession).one()
    photo = db.query(Photo).one()
    assert session.start_photo_id == photo.id
    assert session.started_at == photo.received_at
    assert photo.kind == "start" and photo.status == "pass"


def test_confident_fail_does_not_open_a_session(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임 화면입니다.", {})
    body = start(client, auth, jpeg).json()

    assert body["result"] == "fail"
    assert body["session"] is None
    assert body["reason"] == "게임 화면입니다."
    assert db.query(StudySession).count() == 0
    assert db.query(Photo).one().status == "fail"


def test_unconfident_fail_still_opens_a_session(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.4, "잘 모르겠습니다.", {})
    assert start(client, auth, jpeg).json()["result"] == "pass"
    assert db.query(StudySession).count() == 1


def test_verdict_row_is_always_recorded(client, auth, jpeg, db, judge):
    judge.verdict = Verdict("fail", 0.95, "게임 화면입니다.", {"k": "v"})
    start(client, auth, jpeg)

    row = db.query(VerdictRow).one()
    assert row.attempt == 1
    assert row.provider == "stub" and row.model == "stub-1"
    assert row.decision == "fail" and row.confidence == 0.95
    assert row.raw_json == {"k": "v"}
    assert row.appeal_text is None


def test_resized_image_is_stored(client, auth, jpeg, db, storage):
    start(client, auth, jpeg)
    photo = db.query(Photo).one()
    assert photo.s3_key in storage.items
    assert len(storage.items[photo.s3_key]) < len(jpeg)


def test_second_start_while_open_is_rejected(client, auth, jpeg, db):
    start(client, auth, jpeg)
    r = start(client, auth, jpeg)
    assert r.status_code == 409
    assert db.query(StudySession).count() == 1


def test_current_returns_the_open_session(client, auth, jpeg):
    assert client.get("/sessions/current", headers=auth).json() is None
    start(client, auth, jpeg)
    assert client.get("/sessions/current", headers=auth).json()["status"] == "open"
