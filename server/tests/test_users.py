from app.models import User


def test_first_goal_applies_immediately(client, auth, db):
    """온보딩의 첫 설정. 미루면 첫날은 유저가 고르지도 않은 60분으로 정산된다."""
    r = client.patch("/users/me/goal", headers=auth, json={"minutes": 120})
    assert r.status_code == 200
    body = r.json()
    assert body["daily_goal_minutes"] == 120
    assert body["pending_goal_minutes"] is None
    assert db.query(User).one().goal_initialized is True


def test_goal_change_is_staged_not_applied(client, auth, db):
    client.patch("/users/me/goal", headers=auth, json={"minutes": 120})   # 온보딩
    r = client.patch("/users/me/goal", headers=auth, json={"minutes": 30})
    assert r.status_code == 200
    body = r.json()
    assert body["daily_goal_minutes"] == 120     # 오늘 목표는 그대로
    assert body["pending_goal_minutes"] == 30    # 내일부터 적용


def test_only_the_first_change_is_immediate(client, auth, db):
    """두 번째부터는 미뤄져야 한다 — 밤에 목표를 낮춰 페이백을 타는 것을 막는
    규칙이고, 첫 설정 예외가 그 구멍이 되면 안 된다."""
    client.patch("/users/me/goal", headers=auth, json={"minutes": 120})
    client.patch("/users/me/goal", headers=auth, json={"minutes": 1})
    user = db.query(User).one()
    assert user.daily_goal_minutes == 120        # 오늘은 여전히 120분
    assert user.pending_goal_minutes == 1


def test_latest_change_wins_before_settlement(client, auth, db):
    client.patch("/users/me/goal", headers=auth, json={"minutes": 60})    # 온보딩
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


# 소셜 로그인은 믿을 만한 닉네임을 주지 않는다. 로그인 직후에는 기본값이
# 들어가고 실제 이름은 온보딩에서 받는다 — 아래가 그 저장 경로다.


def test_nickname_applies_immediately(client, auth, db):
    r = client.patch("/users/me/nickname", headers=auth, json={"nickname": "광휘"})
    assert r.status_code == 200
    assert r.json()["nickname"] == "광휘"
    # 목표와 달리 pending 이 아니다 — 이름은 정산과 아무 상관이 없다.
    assert db.query(User).one().nickname == "광휘"


def test_nickname_is_trimmed(client, auth):
    r = client.patch("/users/me/nickname", headers=auth, json={"nickname": "  광휘  "})
    assert r.json()["nickname"] == "광휘"


def test_blank_nickname_is_rejected(client, auth):
    # 피드에 빈 이름이 뜨면 누가 올린 인증인지 알 수 없다.
    assert client.patch("/users/me/nickname", headers=auth,
                        json={"nickname": "   "}).status_code == 422
    assert client.patch("/users/me/nickname", headers=auth,
                        json={"nickname": ""}).status_code == 422


def test_nickname_length_is_capped(client, auth):
    # nickname 컬럼이 String(32) 다. 여기서 막지 않으면 DB 에서 터진다.
    assert client.patch("/users/me/nickname", headers=auth,
                        json={"nickname": "가" * 33}).status_code == 422


def test_nickname_change_requires_auth(client):
    assert client.patch("/users/me/nickname",
                        json={"nickname": "남"}).status_code == 401
