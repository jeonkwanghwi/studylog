import jwt
from jwt import PyJWKClient

from app.config import settings

# 세 곳 다 OIDC라 검증 방식이 같다 — JWKS로 공개키를 받아 서명·발급자·audience를
# 확인한다. 카카오는 한국에서 사실상 표준 로그인이라 빠질 수 없다.
_JWKS = {
    "apple": ("https://appleid.apple.com/auth/keys", "https://appleid.apple.com"),
    "google": ("https://www.googleapis.com/oauth2/v3/certs", "https://accounts.google.com"),
    "kakao": ("https://kauth.kakao.com/.well-known/jwks.json", "https://kauth.kakao.com"),
}
_AUDIENCE = {"apple": lambda: settings.apple_bundle_id,
             "google": lambda: settings.google_client_id,
             "kakao": lambda: settings.kakao_rest_api_key}
_clients: dict[str, PyJWKClient] = {}


def _client(url: str) -> PyJWKClient:
    if url not in _clients:
        _clients[url] = PyJWKClient(url, cache_keys=True)
    return _clients[url]


def verify_social_token(provider: str, id_token: str) -> str:
    """소셜 id_token을 검증하고 계정 고유 sub를 돌려준다. 실패하면 ValueError."""
    if provider not in _JWKS:
        raise ValueError(f"unknown provider: {provider}")
    jwks_url, issuer = _JWKS[provider]
    try:
        key = _client(jwks_url).get_signing_key_from_jwt(id_token).key
        claims = jwt.decode(
            id_token, key, algorithms=["RS256"],
            issuer=issuer, audience=_AUDIENCE[provider](),
        )
    except Exception as exc:
        raise ValueError(f"invalid {provider} token") from exc
    return claims["sub"]
