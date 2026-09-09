from pydantic import BaseModel, Field


class SocialLoginIn(BaseModel):
    provider: str = Field(pattern="^(apple|google)$")
    id_token: str
    nickname: str = Field(min_length=1, max_length=32)


class UserOut(BaseModel):
    id: str
    nickname: str
    daily_goal_minutes: int
    pending_goal_minutes: int | None
    streak_count: int
    credit_balance: int

    model_config = {"from_attributes": True}


class LoginOut(BaseModel):
    access_token: str
    user: UserOut
