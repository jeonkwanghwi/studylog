import random
from datetime import datetime


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
