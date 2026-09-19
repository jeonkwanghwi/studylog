from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth.verifiers import verify_social_token
from app.config import settings
from app.db import get_db
from app.models import User
from app.schemas import LoginOut, SocialLoginIn
from app.security import create_access_token, get_current_user

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


@router.post("/auth/refresh", response_model=LoginOut)
def refresh_token(user: User = Depends(get_current_user)) -> LoginOut:
    """아직 유효한 토큰을 더 긴 토큰으로 바꿔준다.

    토큰은 90일짜리인데 갱신 경로가 없었다. 매일 쓰던 사람도 90일째에
    예고 없이 로그아웃된다 — 출시 3개월 뒤 한꺼번에 터지는 종류의 문제다.

    앱이 만료 60일 전부터 앱을 열 때마다 이걸 부른다. 그래서 두 달에 한 번만
    앱을 열어도 로그인이 유지된다.

    갱신에 별도 refresh token 을 쓰지 않는다. 우리에겐 토큰 폐기 수단이
    아예 없어서, 둘로 나눠도 훔친 토큰을 막지 못한다 — 복잡도만 늘고
    보안은 그대로다. 폐기가 필요해지면 그때 같이 설계한다.
    """
    return LoginOut(access_token=create_access_token(user.id), user=user)


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
