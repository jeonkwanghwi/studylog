from app.models import User


def test_goal_change_is_staged_not_applied(client, auth, db):
    r = client.patch("/users/me/goal", headers=auth, json={"minutes": 30})
    assert r.status_code == 200
    body = r.json()
    assert body["daily_goal_minutes"] == 60      # 오늘 목표는 그대로
    assert body["pending_goal_minutes"] == 30    # 내일부터 적용


def test_latest_change_wins_before_settlement(client, auth, db):
    client.patch("/users/me/goal", headers=auth, json={"minutes": 30})
    client.patch("/users/me/goal", headers=auth, json={"minutes": 120})
    assert db.query(User).one().pending_goal_minutes == 120


def test_goal_must_be_within_bounds(client, auth):
    assert client.patch("/users/me/goal", headers=auth, json={"minutes": 0}).status_code == 422
    assert client.patch("/users/me/goal", headers=auth, json={"minutes": 1441}).status_code == 422


def test_push_token_is_saved(client, auth, db):
    r = client.put("/users/me/push-token", headers=auth,
                   json={"token": "ExponentPushToken[abc]"})
    assert r.status_code == 204
    assert db.query(User).one().expo_push_token == "ExponentPushToken[abc]"


def test_goal_change_requires_auth(client):
    assert client.patch("/users/me/goal", json={"minutes": 30}).status_code == 401
