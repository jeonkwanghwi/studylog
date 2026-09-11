import pytest

from app.judge.claude import ClaudeJudge, parse_tool_response
from app.judge.prompt import build_prompt
from app.judge.registry import build_provider


def test_prompt_includes_the_declared_activity_verbatim():
    prompt = build_prompt("런닝머신 30분", None)
    assert "런닝머신 30분" in prompt


def test_prompt_states_the_wide_acceptance_and_reject_only_mismatch_policy():
    prompt = build_prompt("수학 문제집", None)
    assert "재촬영" in prompt
    assert "확신이 없으면 통과" in prompt


def test_appeal_text_is_marked_as_a_hint_not_evidence():
    prompt = build_prompt("공부", "태블릿으로 인강 듣는 중입니다")
    assert "태블릿으로 인강 듣는 중입니다" in prompt
    assert "참고" in prompt and "이미지" in prompt


def test_parse_reads_the_tool_call():
    class Block:
        type = "tool_use"
        name = "report_verdict"
        input = {"decision": "fail", "confidence": 0.92, "reason": "게임 화면입니다."}

    verdict = parse_tool_response([Block()])
    assert verdict.decision == "fail"
    assert verdict.confidence == 0.92
    assert verdict.raw["decision"] == "fail"


def test_parse_without_a_tool_call_raises():
    class Text:
        type = "text"

    with pytest.raises(ValueError):
        parse_tool_response([Text()])


def test_registry_builds_claude_by_name():
    provider = build_provider("claude", "claude-haiku-4-5")
    assert isinstance(provider, ClaudeJudge)
    assert provider.name == "claude"
    assert provider.model == "claude-haiku-4-5"


def test_registry_rejects_unknown_provider():
    with pytest.raises(ValueError):
        build_provider("nope", "x")
