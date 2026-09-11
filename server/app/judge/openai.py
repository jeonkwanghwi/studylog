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

    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        # SDK 자체 재시도를 끈다 — judge_photo 의 재시도 계층과 겹치면 한 번 판정에
        # 최대 9번 호출이 나가고, judge_timeout_seconds 예산이 그걸로 소모된다.
        self._client = AsyncOpenAI(api_key=api_key, max_retries=0)

    async def judge(
        self, image: bytes, activity: str, appeal_text: str | None = None
    ) -> Verdict:
        response = await self._client.chat.completions.create(
            model=self.model,
            response_format=VERDICT_RESPONSE_FORMAT,
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
