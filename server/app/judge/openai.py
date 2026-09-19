import base64
import json

from openai import AsyncOpenAI

from app.judge.base import Verdict
from app.judge.prompt import build_prompt

VERDICT_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "verdict",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "decision": {"type": "string", "enum": ["pass", "fail"]},
                "confidence": {"type": "number"},
                "reason": {"type": "string"},
            },
            "required": ["decision", "confidence", "reason"],
            "additionalProperties": False,
        },
    },
}


def parse_verdict(content: str | None) -> Verdict:
    if not content:
        raise ValueError("응답에 내용이 없습니다")
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"응답을 JSON으로 파싱할 수 없습니다: {content!r}") from exc
    try:
        return Verdict(
            decision=data["decision"],
            confidence=float(data["confidence"]),
            reason=data["reason"],
            raw=data,
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"응답 형식이 올바르지 않습니다: {data!r}") from exc


class OpenAIJudge:
    name = "openai"

    def __init__(self, model: str, api_key: str, reasoning_effort: str = "") -> None:
        self.model = model
        # GPT-5 계열은 보이는 답을 내기 전에 추론 토큰을 먼저 쓴다. 그대로
        # 두면 예산을 추론이 다 먹어서 content 가 빈 문자열로 온다 —
        # 실측에서 200 토큰이 전부 추론으로 소모되고 답이 하나도 없었다.
        # 우리 과제는 "이 장면이 선언과 맞는가"라 긴 추론이 필요 없다.
        self.reasoning_effort = reasoning_effort
        # SDK 자체 재시도를 끈다 — judge_photo 의 재시도 계층과 겹치면 한 번 판정에
        # 최대 9번 호출이 나가고, judge_timeout_seconds 예산이 그걸로 소모된다.
        self._client = AsyncOpenAI(api_key=api_key, max_retries=0)

    async def judge(
        self, image: bytes, activity: str, appeal_text: str | None = None
    ) -> Verdict:
        extra = (
            {"reasoning_effort": self.reasoning_effort} if self.reasoning_effort else {}
        )
        response = await self._client.chat.completions.create(
            model=self.model,
            response_format=VERDICT_RESPONSE_FORMAT,
            **extra,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/jpeg;base64,{base64.b64encode(image).decode()}",
                    }},
                    {"type": "text", "text": build_prompt(activity, appeal_text)},
                ],
            }],
        )
        return parse_verdict(response.choices[0].message.content)
