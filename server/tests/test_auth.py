import pytest

from app.models import User


@pytest.fixture(autouse=True)
def fake_social(monkeypatch):
    """소셜 검증은 외부 의존이라 테스트에서는 id_token을 sub로 그대로 쓴다."""
    def _verify(provider: str, id_token: str) -> str:
        if id_token == "bad":
            raise ValueError("invalid token")
        return f"{provider}-{id_token}"

    monkeypatch.setattr("app.routers.auth.verify_social_token", _verify)


def test_first_login_creates_user(client, db):
    r = client.post("/auth/social", json={
        "provider": "apple", "id_token": "tok1", "nickname": "광휘",
    })
    assert r.status_code == 200
    assert r.json()["user"]["nickname"] == "광휘"
    assert db.query(User).count() == 1


def test_second_login_reuses_the_same_user(client, db):
    body = {"provider": "apple", "id_token": "tok1", "nickname": "광휘"}
    first = client.post("/auth/social", json=body).json()
    second = client.post("/auth/social", json=body).json()
    assert first["user"]["id"] == second["user"]["id"]
    assert db.query(User).count() == 1


def test_invalid_social_token_is_rejected(client):
    r = client.post("/auth/social", json={
        "provider": "apple", "id_token": "bad", "nickname": "광휘",
    })
    assert r.status_code == 401


def test_me_requires_a_token(client):
    # 자격증명 자체가 없으면 401이다. 403은 "인증은 됐는데 권한이 없다"는 뜻이라
    # 로그인하지 않은 요청에는 맞지 않는다.
    assert client.get("/users/me").status_code == 401


def test_me_returns_the_logged_in_user(client):
    token = client.post("/auth/social", json={
        "provider": "google", "id_token": "tok2", "nickname": "휘",
    }).json()["access_token"]

    r = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["nickname"] == "휘"
    assert r.json()["credit_balance"] == 0


def test_kakao_is_an_accepted_provider(client, db):
    """카카오는 한국에서 사실상 표준 로그인이다. 애플·구글과 같은 OIDC 경로를 탄다."""
    r = client.post("/auth/social", json={
        "provider": "kakao", "id_token": "tok-kakao", "nickname": "광휘",
    })
    assert r.status_code == 200
    assert db.query(User).filter_by(provider="kakao").count() == 1


def test_unknown_provider_is_rejected_by_the_schema(client):
    r = client.post("/auth/social", json={
        "provider": "naver", "id_token": "t", "nickname": "광휘",
    })
    assert r.status_code == 422
