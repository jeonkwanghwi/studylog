import json

import pytest

from app.judge.openai import OpenAIJudge, parse_verdict
from app.judge.registry import build_provider


def test_parse_reads_the_json_content():
    content = json.dumps({"decision": "fail", "confidence": 0.92, "reason": "게임 화면입니다."})
    verdict = parse_verdict(content)
    assert verdict.decision == "fail"
    assert verdict.confidence == 0.92
    assert verdict.raw["decision"] == "fail"


def test_parse_missing_content_raises():
    with pytest.raises(ValueError):
        parse_verdict(None)


def test_parse_malformed_json_raises():
    with pytest.raises(ValueError):
        parse_verdict("not json")


def test_parse_missing_field_raises():
    with pytest.raises(ValueError):
        parse_verdict(json.dumps({"decision": "pass"}))


def test_registry_builds_openai_by_name():
    provider = build_provider("openai", "gpt-4o-mini")
    assert isinstance(provider, OpenAIJudge)
    assert provider.name == "openai"
    assert provider.model == "gpt-4o-mini"


def test_registry_rejects_unknown_provider():
    with pytest.raises(ValueError):
        build_provider("nope", "x")
