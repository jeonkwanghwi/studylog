from app.config import settings
from app.judge.base import JudgeProvider


def build_provider(name: str, model: str) -> JudgeProvider:
    """설정된 프로바이더만 import 한다.

    전에는 모든 프로바이더를 모듈 최상단에서 import 했다. 그래서 쓰지도 않는
    SDK 하나가 설치돼 있지 않으면 앱 전체가 죽었다 — 실제로 openai 패키지가
    없는 서버에서 /sessions/start 가 통째로 500 이 났다.
    """
    if name == "claude":
        from app.judge.claude import ClaudeJudge

        return ClaudeJudge(model=model, api_key=settings.anthropic_api_key)
    if name == "openai":
        from app.judge.openai import OpenAIJudge

        return OpenAIJudge(
            model=model,
            api_key=settings.openai_api_key,
            reasoning_effort=settings.judge_reasoning_effort,
        )
    raise ValueError(f"unknown judge provider: {name}")
