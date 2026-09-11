from app.config import settings
from app.judge.base import JudgeProvider
from app.judge.claude import ClaudeJudge
from app.judge.openai import OpenAIJudge


def build_provider(name: str, model: str) -> JudgeProvider:
    if name == "claude":
        return ClaudeJudge(model=model, api_key=settings.anthropic_api_key)
    if name == "openai":
        return OpenAIJudge(model=model, api_key=settings.openai_api_key)
    raise ValueError(f"unknown judge provider: {name}")
