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

    async def judge(
        self, image: bytes, activity: str, appeal_text: str | None = None
    ) -> Verdict: ...


def is_pass(verdict: Verdict, fail_threshold: float) -> bool:
    """관대 원칙: 확신하는 fail만 거르고 나머지는 전부 통과시킨다."""
    return not (verdict.decision == "fail" and verdict.confidence >= fail_threshold)


def _is_retryable(exc: Exception) -> bool:
    """429(rate limit)와 5xx(서버 장애)만 재시도한다. 그 외는 즉시 관대 통과로 넘어간다."""
    status_code = getattr(exc, "status_code", None)
    if status_code is None:
        return False
    return status_code == 429 or 500 <= status_code < 600


async def _judge_with_retry(
    provider: JudgeProvider, image: bytes, activity: str, appeal_text: str | None
) -> Verdict:
    attempts = settings.judge_retry_attempts
    for attempt in range(1, attempts + 1):
        logger.info("판정 시도 %d/%d (provider=%s)", attempt, attempts, provider.name)
        try:
            return await provider.judge(image, activity, appeal_text)
        except Exception as exc:
            if attempt == attempts or not _is_retryable(exc):
                raise
            backoff = settings.judge_retry_backoff_seconds * (2 ** (attempt - 1))
            logger.warning(
                "판정 시도 %d/%d 실패, %.2f초 후 재시도: %r", attempt, attempts, backoff, exc
            )
            await asyncio.sleep(backoff)
    raise AssertionError("unreachable")  # pragma: no cover


async def judge_photo(
    provider: JudgeProvider, image: bytes, activity: str, appeal_text: str | None = None
) -> Verdict:
    """판정을 부르되, 느리거나 터지면 통과시킨다.

    AI 장애로 유저의 공부 시간이 날아가는 것이 오탐 통과보다 훨씬 나쁘다.
    재시도까지 포함해 judge_timeout_seconds 예산 안에서만 기다린다.
    """
    try:
        return await asyncio.wait_for(
            _judge_with_retry(provider, image, activity, appeal_text),
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


@dataclass(frozen=True)
class BrokenJudge:
    """판정기를 만들지 못했을 때 자리를 대신한다.

    부르면 던지고, judge_photo 가 그것을 관대 통과로 흡수한다. 이 경로가
    없으면 설정이 틀린 순간 /sessions/start 가 통째로 500 이 되어 유저가
    공부를 시작조차 못 한다 — AI 장애로 공부 시간이 날아가는 것이 오탐
    통과보다 나쁘다는 원칙이 여기에도 적용돼야 한다.

    다만 조용히 넘기지는 않는다. 장애는 지나가지만 설정 오류는 영원히
    남아서, 눈치채지 못하면 모든 사진이 공짜로 통과한다.
    """

    name: str = "broken"
    model: str = "-"
    reason: str = ""

    async def judge(self, image: bytes, activity: str,
                    appeal_text: str | None = None) -> Verdict:
        raise RuntimeError(f"판정기를 만들지 못했습니다: {self.reason}")


def get_judge() -> JudgeProvider:
    """FastAPI 의존성. 판정기를 만든다."""
    from app.judge.registry import build_provider

    try:
        return build_provider(settings.judge_provider, settings.judge_model)
    except Exception as exc:
        logger.error(
            "판정기 생성 실패 — 모든 사진이 관대 통과로 처리된다 "
            "(provider=%s): %r", settings.judge_provider, exc
        )
        return BrokenJudge(reason=repr(exc))
