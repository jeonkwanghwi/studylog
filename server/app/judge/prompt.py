BASE_PROMPT = """당신은 인증 사진이 유저가 선언한 활동과 맞는지 판정한다.

유저가 지금 하고 있다고 선언한 활동: "{activity}"

## 통과(pass)시킬 것 — 넓게 인정한다
- 같은 활동도 장소·도구·각도에 따라 전혀 다르게 보일 수 있다.
  선언한 활동과 이어지는 정황(환경, 도구, 장비)이 보이면 통과시켜라.
- 사람이 프레임에 없어도 된다. 그 활동에 맞는 환경이나 도구가 보이는 것으로 충분하다.
- 조명이 어둡거나 각도가 나빠도 그 자체는 거절 사유가 아니다.

## 거를(fail) 것 — 이것만 거른다
- 사진이 선언한 활동과 명백히 무관한 경우
- 모니터나 다른 기기 화면에 띄운 사진을 다시 찍은 것(재촬영)
- 인쇄물이나 종이에 인쇄된 사진을 찍은 것

## 판정 원칙
확신이 없으면 통과시켜라. 실제로 선언한 활동을 한 사람을 잘못 거르는 것이,
하지 않은 사람을 통과시키는 것보다 훨씬 나쁘다.
`confidence`는 그 판정을 얼마나 확신하는지다. 애매하면 0.5 아래로 낮춰라.
`reason`은 한국어 한 문장으로 쓴다."""

APPEAL_TEMPLATE = """

## 유저의 이의제기
이 사진은 앞서 거절됐고, 유저가 다음과 같이 설명했다.

> {appeal_text}

이 설명은 **참고 힌트일 뿐이다.** 판단 근거는 어디까지나 이미지 자체다.
설명이 이미지와 맞지 않으면 설명을 무시하고 이미지대로 판정하라."""

VERDICT_TOOL = {
    "name": "report_verdict",
    "description": "인증 사진이 선언된 활동과 맞는지 판정을 보고한다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "decision": {"type": "string", "enum": ["pass", "fail"]},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reason": {"type": "string", "description": "한국어 한 문장"},
        },
        "required": ["decision", "confidence", "reason"],
    },
}


def build_prompt(activity: str, appeal_text: str | None) -> str:
    prompt = BASE_PROMPT.format(activity=activity)
    if not appeal_text:
        return prompt
    return prompt + APPEAL_TEMPLATE.format(appeal_text=appeal_text)
