import pytest

from app.judge.claude import ClaudeJudge, parse_tool_response
from app.judge.prompt import build_prompt
from app.judge.registry import build_provider


def test_prompt_lists_the_wide_pass_range():
    prompt = build_prompt(None)
    for allowed in ["종이책", "노트북", "태블릿", "인강"]:
        assert allowed in prompt
    for rejected in ["게임", "재촬영"]:
        assert rejected in prompt


def test_appeal_text_is_marked_as_a_hint_not_evidence():
    prompt = build_prompt("태블릿으로 인강 듣는 중입니다")
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
