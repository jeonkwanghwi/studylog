import random
from datetime import datetime
from typing import NamedTuple


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


# 선 결제 → 인앱 크레딧 페이백. daily_payback * days 는 price 를 넘지 않는다.
CHALLENGE_PRODUCTS: dict[str, ChallengeSpec] = {
    "challenge_7d": ChallengeSpec(days=7, price=7000, daily_payback=1000, completion_bonus=0),
    "challenge_30d": ChallengeSpec(days=30, price=30000, daily_payback=1000, completion_bonus=3000),
}

GRANTING_EVENT_TYPES = {"INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"}
