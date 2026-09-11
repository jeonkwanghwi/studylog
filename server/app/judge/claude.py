import base64

import anthropic

from app.judge.base import Verdict
from app.judge.prompt import VERDICT_TOOL, build_prompt


def parse_tool_response(content: list) -> Verdict:
    for block in content:
        if getattr(block, "type", None) == "tool_use" and block.name == "report_verdict":
            data = dict(block.input)
            return Verdict(
                decision=data["decision"],
                confidence=float(data["confidence"]),
                reason=data["reason"],
                raw=data,
            )
    raise ValueError("응답에 report_verdict 도구 호출이 없습니다")


class ClaudeJudge:
    name = "claude"

    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    async def judge(
        self, image: bytes, activity: str, appeal_text: str | None = None
    ) -> Verdict:
        message = await self._client.messages.create(
            model=self.model,
            max_tokens=256,
            tools=[VERDICT_TOOL],
            tool_choice={"type": "tool", "name": "report_verdict"},
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": base64.b64encode(image).decode(),
                    }},
                    {"type": "text", "text": build_prompt(activity, appeal_text)},
                ],
            }],
        )
        return parse_tool_response(message.content)
