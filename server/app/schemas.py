from datetime import date as Date, datetime

from pydantic import BaseModel, Field


class SocialLoginIn(BaseModel):
    provider: str = Field(pattern="^(apple|google|kakao)$")
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
    activity: str
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


class NicknameIn(BaseModel):
    # 모델의 nickname 컬럼이 String(32) 이다. 여기서 막지 않으면 DB 에서
    # 잘리거나 터진다. 공백만 들어오는 것도 막는다 — 피드에 빈 이름이 뜬다.
    nickname: str = Field(min_length=1, max_length=32)


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


class ChallengeJoinIn(BaseModel):
    product_id: str = Field(min_length=1, max_length=32)


class ChallengeProductOut(BaseModel):
    product_id: str
    days: int
    daily_payback: int
    price: int
    completion_bonus: int


class ChallengeOut(BaseModel):
    id: str
    product_id: str
    entry_amount: int
    daily_payback: int
    completion_bonus: int
    total_days: int
    started_on: Date
    ends_on: Date
    paid_with: str
    status: str

    model_config = {"from_attributes": True}


class DailyRecordOut(BaseModel):
    id: str
    date: Date
    total_minutes: int
    goal_minutes: int
    result: str
    payback_amount: int
    streak_snapshot: int
    settled_at: datetime

    model_config = {"from_attributes": True}
