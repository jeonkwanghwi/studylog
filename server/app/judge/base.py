import asyncio
import logging
from dataclasses import dataclass, field
from typing import Protocol

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Verdict:
    decision: str          # "pass" | "fail"
    confidence: float      # 0.0 ~ 1.0
    reason: str
    raw: dict = field(default_factory=dict)


class JudgeProvider(Protocol):
    name: str
    model: str

    async def judge(self, image: bytes, appeal_text: str | None = None) -> Verdict: ...


def is_pass(verdict: Verdict, fail_threshold: float) -> bool:
    """관대 원칙: 확신하는 fail만 거르고 나머지는 전부 통과시킨다."""
    return not (verdict.decision == "fail" and verdict.confidence >= fail_threshold)


async def judge_photo(
    provider: JudgeProvider, image: bytes, appeal_text: str | None = None
) -> Verdict:
    """판정을 부르되, 느리거나 터지면 통과시킨다.

    AI 장애로 유저의 공부 시간이 날아가는 것이 오탐 통과보다 훨씬 나쁘다.
    """
    try:
        return await asyncio.wait_for(
            provider.judge(image, appeal_text),
            timeout=settings.judge_timeout_seconds,
        )
    except Exception as exc:
        logger.warning("판정 실패, 관대 원칙으로 통과 처리: %r", exc)
        return Verdict(
            decision="pass",
            confidence=0.0,
            reason="판정을 받지 못해 통과 처리했습니다.",
            raw={"error": repr(exc)},
        )


def get_judge() -> JudgeProvider:
    """FastAPI 의존성. 프로바이더는 Task 6에서 등록한다."""
    from app.judge.registry import build_provider

    return build_provider(settings.judge_provider, settings.judge_model)
