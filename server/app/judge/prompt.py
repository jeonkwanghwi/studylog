BASE_PROMPT = """당신은 공부 인증 사진을 판정한다.

## 통과(pass)시킬 것 — 넓게 인정한다
- 책상·도서관·독서실·학원·카페에서 무언가에 집중하고 있는 장면
- 종이책, 문제집, 노트 필기
- 노트북으로 코딩하거나 문서를 작성하는 화면
- 태블릿 필기, 인강 수강 화면
- 사람이 프레임에 없어도 된다. 학습 환경이 보이면 충분하다
- 조명이 어둡거나 각도가 나빠도, 공부 상황으로 보이면 통과시킨다

## 거를(fail) 것 — 이것만 거른다
- 게임 화면, 예능·드라마·영화, SNS 피드, 쇼핑
- 음식·술자리·풍경 등 공부와 무관한 장면
- 모니터나 다른 기기 화면에 띄운 사진을 다시 찍은 것(재촬영)
- 인쇄물이나 종이에 인쇄된 사진을 찍은 것

## 판정 원칙
확신이 없으면 통과시켜라. 실제로 공부한 사람을 잘못 거르는 것이,
공부하지 않은 사람을 통과시키는 것보다 훨씬 나쁘다.
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
    "description": "공부 인증 사진에 대한 판정을 보고한다.",
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


def build_prompt(appeal_text: str | None) -> str:
    if not appeal_text:
        return BASE_PROMPT
    return BASE_PROMPT + APPEAL_TEMPLATE.format(appeal_text=appeal_text)
