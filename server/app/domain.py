import random
from datetime import datetime
from typing import NamedTuple

from app.config import settings


def counted_minutes(started_at: datetime, ended_at: datetime, cap: int) -> int:
    """세션이 인정받는 분. 상한을 넘지 않고 음수가 되지 않는다."""
    elapsed = int((ended_at - started_at).total_seconds() // 60)
    return max(0, min(elapsed, cap))


# 손으로 옮겨 적는 코드라 헷갈리는 글자(O/0, I/1)를 뺀다
INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVITE_LENGTH = 6


def generate_invite_code(rng: random.Random | None = None) -> str:
    source = rng or random.SystemRandom()
    return "".join(source.choice(INVITE_ALPHABET) for _ in range(INVITE_LENGTH))


class ChallengeSpec(NamedTuple):
    days: int
    price: int              # 원
    daily_payback: int      # 하루 달성 시 적립액 (원)
    completion_bonus: int   # 전일 달성 시 추가 적립. IAP 참가에만 지급


# 선 결제 → 인앱 크레딧 페이백.
#
# 기간 × 하루 배팅액의 2차원 격자다. 참가비는 언제나 days * daily_payback 이므로
# 전일 달성자는 낸 만큼을 정확히 돌려받고, 완주 보너스만 순이득이 된다.
# 보너스 비율은 기간에 비례한다 — 7일 0%, 14일 5%, 30일 10%.
_BONUS_RATE = {7: 0.0, 14: 0.05, 30: 0.10}


def _spec(days: int, daily: int) -> ChallengeSpec:
    price = days * daily
    return ChallengeSpec(days=days, price=price, daily_payback=daily,
                         completion_bonus=int(price * _BONUS_RATE[days]))


# settings.max_entry_amount 를 넘는 조합은 상품으로 만들지 않는다. 스토어에 등록조차
# 되지 않으므로 살 수가 없다 — 애플이 돈을 걷은 뒤에 거절하는 상황이 원천적으로 없다.
CHALLENGE_PRODUCTS: dict[str, ChallengeSpec] = {
    name: spec
    for days in (7, 14, 30)
    for daily in (1000, 2000, 3000)
    for name, spec in [(f"challenge_{days}d_{daily // 1000}k", _spec(days, daily))]
    if spec.price <= settings.max_entry_amount
}

GRANTING_EVENT_TYPES = {"INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"}


class Outcome(NamedTuple):
    result: str          # success | failed  (passed 는 사후 복구로만 생긴다)
    payback: int         # 이날 적립될 크레딧
    new_streak: int


def settle_outcome(total: int, goal: int, streak: int, daily_payback: int) -> Outcome:
    """하루치 결과를 정한다. 스펙 §4.3.

    선 결제 모델이라 사전 방어가 없다. 달성하면 하루치를 돌려받고,
    못 하면 그 몫은 서비스에 귀속된다. `daily_payback`이 0이면 활성 챌린지가 없는
    유저이며, streak만 계산되고 크레딧은 움직이지 않는다.
    """
    if total >= goal:
        return Outcome("success", daily_payback, streak + 1)
    return Outcome("failed", 0, 0)
