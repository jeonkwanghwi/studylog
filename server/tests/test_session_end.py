from datetime import timedelta

from app.judge.base import Verdict
from app.models import Photo, StudySession


def start(client, auth, jpeg, activity="공부"):
    return client.post("/sessions/start", headers=auth,
                       data={"activity": activity},
                       files={"image": ("s.jpg", jpeg, "image/jpeg")}).json()


def end(client, auth, jpeg, session_id, activity=None):
    data = {"activity": activity} if activity is not None else None
    return client.post(f"/sessions/{session_id}/end", headers=auth,
                       data=data,
                       files={"image": ("e.jpg", jpeg, "image/jpeg")})


def test_pass_closes_the_session_and_counts_minutes(client, auth, jpeg, db):
    session_id = start(client, auth, jpeg)["session"]["id"]
    session = db.get(StudySession, session_id)
    session.started_at = session.started_at - timedelta(minutes=95)
    db.commit()

    body = end(client, auth, jpeg, session_id).json()
    assert body["result"] == "pass"
    assert body["session"]["status"] == "closed"
    assert body["session"]["counted_minutes"] == 95

    db.refresh(session)
    assert session.end_photo_id is not None
    assert session.ended_at is not None


def test_minutes_are_capped_at_four_hours(client, auth, jpeg, db):
    session_id = start(client, auth, jpeg)["session"]["id"]
    session = db.get(StudySession, session_id)
    session.started_at = session.started_at - timedelta(hours=7)
    db.commit()

    body = end(client, auth, jpeg, session_id).json()
    assert body["session"]["counted_minutes"] == 240


def test_fail_keeps_the_session_open(client, auth, jpeg, db, judge):
    session_id = start(client, auth, jpeg)["session"]["id"]
    judge.verdict = Verdict("fail", 0.95, "음식 사진입니다.", {})

    body = end(client, auth, jpeg, session_id).json()
    assert body["result"] == "fail"
    assert body["session"] is None

    session = db.get(StudySession, session_id)
    assert session.status == "open"
    assert session.end_photo_id is None
    assert db.query(Photo).filter_by(kind="end").one().status == "fail"


def test_cannot_end_someone_elses_session(client, auth, jpeg, db, monkeypatch):
    session_id = start(client, auth, jpeg)["session"]["id"]
    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: f"{provider}-other")
    other = client.post("/auth/social", json={
        "provider": "apple", "id_token": "x", "nickname": "남",
    }).json()["access_token"]

    r = end(client, {"Authorization": f"Bearer {other}"}, jpeg, session_id)
    assert r.status_code == 404


def test_cannot_end_a_closed_session(client, auth, jpeg):
    session_id = start(client, auth, jpeg)["session"]["id"]
    end(client, auth, jpeg, session_id)
    assert end(client, auth, jpeg, session_id).status_code == 404


def test_end_is_judged_against_the_declared_start_activity(client, auth, jpeg, db, judge):
    session_id = start(client, auth, jpeg, activity="런닝머신 30분")["session"]["id"]

    end(client, auth, jpeg, session_id, activity="운동하기")
    assert judge.seen_activity == "런닝머신 30분"

    session = db.get(StudySession, session_id)
    assert session.activity == "런닝머신 30분"
