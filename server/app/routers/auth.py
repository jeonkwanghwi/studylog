from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.verifiers import verify_social_token
from app.db import get_db
from app.models import User
from app.schemas import LoginOut, SocialLoginIn, UserOut
from app.security import create_access_token, get_current_user

router = APIRouter(tags=["auth"])


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


@router.get("/users/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
