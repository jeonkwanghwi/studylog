from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth.verifiers import verify_social_token
from app.config import settings
from app.db import get_db
from app.models import User
from app.schemas import LoginOut, SocialLoginIn
from app.security import create_access_token

router = APIRouter(tags=["auth"])


@router.get("/auth/kakao/callback")
def kakao_callback(request: Request) -> RedirectResponse:
    """카카오가 인가 코드를 돌려보내는 자리. 받은 그대로 앱으로 넘긴다.

    카카오는 리다이렉트 주소로 http/https 만 받는다 — Apple·Google 과 달리
    앱 스킴(studylog://)을 등록하면 "유효하지 않은 URL"로 거부한다. 그래서
    앱이 카카오에서 바로 돌아올 수 없고 이 엔드포인트를 한 번 거쳐야 한다.

    여기서는 아무것도 해석하지 않는다. 코드 교환은 앱이 PKCE 로 하고,
    code_verifier 는 앱에만 있다 — 서버로 가져오면 그 비밀이 네트워크를
    한 번 더 건너게 되고, 서버가 앱을 대신해 토큰을 받을 수 있게 된다.
    성공이든 실패든 쿼리스트링을 그대로 실어 보내야 앱이 사유를 보여줄 수 있다.
    """
    query = urlencode(dict(request.query_params))
    target = f"{settings.app_scheme}://oauth"
    return RedirectResponse(f"{target}?{query}" if query else target, status_code=302)


@router.post("/auth/social", response_model=LoginOut)
def social_login(body: SocialLoginIn, db: Session = Depends(get_db)) -> LoginOut:
    try:
        sub = verify_social_token(body.provider, body.id_token)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid social token")

    user = (db.query(User)
              .filter_by(provider=body.provider, provider_sub=sub)
              .one_or_none())
    if user is None:
        user = User(provider=body.provider, provider_sub=sub, nickname=body.nickname)
        db.add(user)
        db.commit()

    return LoginOut(access_token=create_access_token(user.id), user=user)
