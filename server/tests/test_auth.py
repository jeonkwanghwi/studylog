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


def test_google_accepts_every_configured_platform_client_id(monkeypatch):
    """플랫폼마다 client id 가 다르고 id_token 의 aud 는 로그인을 시작한 그것이다.
    하나만 허용하면 한쪽 빌드가 조용히 깨진다."""
    from app.auth import verifiers

    monkeypatch.setattr(verifiers.settings, "google_client_id", "web.apps.googleusercontent.com")
    monkeypatch.setattr(verifiers.settings, "google_ios_client_id", "ios.apps.googleusercontent.com")
    monkeypatch.setattr(verifiers.settings, "google_android_client_id", "aos.apps.googleusercontent.com")

    assert verifiers._AUDIENCE["google"]() == [
        "web.apps.googleusercontent.com",
        "ios.apps.googleusercontent.com",
        "aos.apps.googleusercontent.com",
    ]


def test_google_audience_skips_unset_platforms(monkeypatch):
    from app.auth import verifiers

    monkeypatch.setattr(verifiers.settings, "google_client_id", "web.apps.googleusercontent.com")
    monkeypatch.setattr(verifiers.settings, "google_ios_client_id", "")
    monkeypatch.setattr(verifiers.settings, "google_android_client_id", "")

    assert verifiers._AUDIENCE["google"]() == ["web.apps.googleusercontent.com"]


class TestKakaoCallback:
    """카카오는 앱 스킴을 리다이렉트로 등록할 수 없어 서버를 한 번 거친다."""

    def test_인가코드를_앱_스킴으로_넘긴다(self, client):
        r = client.get("/auth/kakao/callback?code=ABC123&state=xyz",
                       follow_redirects=False)
        assert r.status_code == 302
        assert r.headers["location"] == "studylog://oauth?code=ABC123&state=xyz"

    def test_실패도_그대로_넘긴다(self, client):
        # 여기서 삼키면 앱은 왜 로그인이 안 됐는지 영원히 알 수 없다.
        r = client.get("/auth/kakao/callback?error=access_denied",
                       follow_redirects=False)
        assert r.status_code == 302
        assert r.headers["location"] == "studylog://oauth?error=access_denied"

    def test_코드를_서버가_교환하지_않는다(self, client, monkeypatch):
        """code_verifier 는 앱에만 있어야 한다. 서버가 교환을 시도하면
        그 비밀이 네트워크를 한 번 더 건너고, 서버가 앱을 대신해 토큰을
        받을 수 있게 된다."""
        import httpx

        called = []
        monkeypatch.setattr(httpx, "post", lambda *a, **k: called.append(a))
        client.get("/auth/kakao/callback?code=ABC123", follow_redirects=False)
        assert called == []
