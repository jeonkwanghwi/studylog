import asyncio

import pytest

from app.judge.base import Verdict, is_pass, judge_photo


def v(decision: str, confidence: float) -> Verdict:
    return Verdict(decision=decision, confidence=confidence, reason="", raw={})


@pytest.mark.parametrize("decision,confidence,expected", [
    ("fail", 0.9, False),   # 확신하는 fail만 거른다
    ("fail", 0.7, False),   # 경계값은 fail 쪽
    ("fail", 0.69, True),   # 확신 없는 fail은 통과
    ("fail", 0.1, True),
    ("pass", 0.1, True),    # 확신 없는 pass도 통과
    ("pass", 0.99, True),
])
def test_only_confident_fails_are_rejected(decision, confidence, expected):
    assert is_pass(v(decision, confidence), 0.7) is expected


class SlowProvider:
    name, model = "slow", "slow-1"

    async def judge(self, image, appeal_text=None):
        await asyncio.sleep(10)
        return v("fail", 1.0)


class BrokenProvider:
    name, model = "broken", "broken-1"

    async def judge(self, image, appeal_text=None):
        raise RuntimeError("API 500")


class FakeProvider:
    name, model = "fake", "fake-1"

    def __init__(self, verdict):
        self.verdict = verdict
        self.seen_appeal = None

    async def judge(self, image, appeal_text=None):
        self.seen_appeal = appeal_text
        return self.verdict


async def test_timeout_passes_leniently(monkeypatch):
    monkeypatch.setattr("app.judge.base.settings.judge_timeout_seconds", 0.01)
    result = await judge_photo(SlowProvider(), b"img")
    assert result.decision == "pass"
    assert "error" in result.raw


async def test_provider_error_passes_leniently():
    result = await judge_photo(BrokenProvider(), b"img")
    assert result.decision == "pass"
    assert "API 500" in result.raw["error"]


async def test_appeal_text_reaches_the_provider():
    provider = FakeProvider(v("pass", 0.8))
    await judge_photo(provider, b"img", appeal_text="인강 듣는 중입니다")
    assert provider.seen_appeal == "인강 듣는 중입니다"
