from datetime import datetime

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


class SessionOut(BaseModel):
    id: str
    started_at: datetime
    ended_at: datetime | None
    counted_minutes: int
    status: str

    model_config = {"from_attributes": True}


class JudgeResultOut(BaseModel):
    result: str                       # "pass" | "fail"
    photo_id: str
    reason: str
    session: SessionOut | None = None


class AppealIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class GoalIn(BaseModel):
    minutes: int = Field(ge=1, le=1440)


class PushTokenIn(BaseModel):
    token: str = Field(min_length=1, max_length=255)


class GroupCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class GroupJoinIn(BaseModel):
    invite_code: str = Field(min_length=6, max_length=6)


class GroupOut(BaseModel):
    id: str
    name: str
    invite_code: str

    model_config = {"from_attributes": True}


class FeedPhotoOut(BaseModel):
    kind: str
    url: str
    received_at: datetime


class FeedItemOut(BaseModel):
    user_id: str
    nickname: str
    streak_count: int
    total_minutes: int
    goal_minutes: int
    result: str | None
    photos: list[FeedPhotoOut]
