from datetime import timedelta

from app.models import DailyRecord, Membership, StudySession, User
from app.time_utils import now_utc, study_day


def join_friend(client, monkeypatch, code, nickname="친구"):
    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: f"apple-{nickname}")
    token = client.post("/auth/social", json={
        "provider": "apple", "id_token": nickname, "nickname": nickname,
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/groups/join", headers=headers, json={"invite_code": code})
    return headers


def test_feed_lists_every_member(client, auth, jpeg, db, monkeypatch):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    join_friend(client, monkeypatch, group["invite_code"])

    feed = client.get(f"/groups/{group['id']}/feed", headers=auth).json()
    assert {item["nickname"] for item in feed} == {"광휘", "친구"}
    assert all(item["total_minutes"] == 0 for item in feed)
    assert all(item["result"] is None for item in feed)


def test_closed_sessions_show_up_with_photos(client, auth, jpeg, db):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    session_id = client.post("/sessions/start", headers=auth,
                             data={"activity": "공부"},
                             files={"image": ("s.jpg", jpeg, "image/jpeg")}
                             ).json()["session"]["id"]
    session = db.get(StudySession, session_id)
    session.started_at = session.started_at - timedelta(minutes=50)
    db.commit()
    client.post(f"/sessions/{session_id}/end", headers=auth,
                files={"image": ("e.jpg", jpeg, "image/jpeg")})

    item = client.get(f"/groups/{group['id']}/feed", headers=auth).json()[0]
    assert item["total_minutes"] == 50
    assert {p["kind"] for p in item["photos"]} == {"start", "end"}
    assert all(p["url"] for p in item["photos"])


def test_open_sessions_are_not_counted_yet(client, auth, jpeg, db):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    client.post("/sessions/start", headers=auth,
                data={"activity": "공부"},
                files={"image": ("s.jpg", jpeg, "image/jpeg")})

    item = client.get(f"/groups/{group['id']}/feed", headers=auth).json()[0]
    assert item["total_minutes"] == 0


def test_settled_result_is_shown(client, auth, db):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    user = db.query(User).one()
    db.add(DailyRecord(user_id=user.id, date=study_day(now_utc()),
                       total_minutes=0, goal_minutes=60, result="failed",
                       streak_snapshot=0, settled_at=now_utc()))
    db.commit()

    item = client.get(f"/groups/{group['id']}/feed", headers=auth).json()[0]
    assert item["result"] == "failed"


def test_non_members_cannot_read_the_feed(client, auth, db, monkeypatch):
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: "apple-stranger")
    outsider = {"Authorization": "Bearer " + client.post("/auth/social", json={
        "provider": "apple", "id_token": "s", "nickname": "남",
    }).json()["access_token"]}

    assert client.get(f"/groups/{group['id']}/feed", headers=outsider).status_code == 403


def test_failed_photos_are_hidden_from_the_feed(client, auth, jpeg, db, judge):
    from app.judge.base import Verdict
    group = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    judge.verdict = Verdict("fail", 0.95, "게임입니다.", {})
    client.post("/sessions/start", headers=auth,
                data={"activity": "공부"},
                files={"image": ("s.jpg", jpeg, "image/jpeg")})

    item = client.get(f"/groups/{group['id']}/feed", headers=auth).json()[0]
    assert item["photos"] == []
