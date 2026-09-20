import { render, screen } from "@testing-library/react-native";

import Legal from "../app/legal/[doc]";
import { NEEDS_INPUT, PRIVACY, TERMS } from "../src/legal/content";

let mockDoc = "terms";
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ doc: mockDoc }),
}));

describe("약관·개인정보처리방침", () => {
  it("이용약관이 실제로 열린다", async () => {
    mockDoc = "terms";
    await render(<Legal />);
    expect(screen.getByText("이용약관")).toBeTruthy();
  });

  it("개인정보처리방침이 실제로 열린다", async () => {
    mockDoc = "privacy";
    await render(<Legal />);
    expect(screen.getByText("개인정보처리방침")).toBeTruthy();
  });

  it("없는 문서는 막다른 길이 아니다", async () => {
    mockDoc = "nope";
    await render(<Legal />);
    expect(screen.getByText("없는 문서입니다")).toBeTruthy();
    expect(screen.getByText("닫기")).toBeTruthy();
  });

  it("아직 못 채운 항목이 있으면 그 사실을 숨기지 않는다", async () => {
    // 조용히 넘어가면 빈 곳이 있는 채로 제출된다.
    mockDoc = "privacy";
    await render(<Legal />);
    expect(screen.getByText(/출시 전에 채웁니다/)).toBeTruthy();
  });

  it("수집 항목에 이메일·실명을 받지 않는다고 명시한다", () => {
    // 실제로 openid 스코프만 요청한다. 문서가 코드와 어긋나면 허위 고지다.
    const lines = PRIVACY.flatMap((s) => s.body).join(" ");
    expect(lines).toMatch(/이메일, 실명, 프로필 사진, 생년월일, 성별을 요청하지 않으며/);
  });

  it("개인 개발자로 내므로 사업자 정보를 적지 않는다", () => {
    // 없는 사업자등록번호를 적는 것 자체가 허위 표시다.
    const operator = TERMS.find((s) => s.heading === "운영자 정보")!;
    const text = operator.body.join(" ");
    expect(text).not.toMatch(/사업자등록번호|상호/);
    expect(text).toContain("개인 개발자");
  });

  it("남은 빈칸은 문의처 하나뿐이다", () => {
    // 무엇이 남았는지를 숫자로 고정해둔다. 하나씩 채우다 보면 뭐가
    // 남았는지 잊고, 잊은 채로 제출된다.
    const all = [...TERMS, ...PRIVACY].flatMap((s) => s.body);
    const blanks = all.filter((line) => line.includes(NEEDS_INPUT));
    expect(blanks.every((line) => line.includes("문의") || line.includes("요청은"))).toBe(true);
  });

  it("운영자와 시행일은 채워졌다", () => {
    const operator = TERMS.find((s) => s.heading === "운영자 정보")!;
    const text = operator.body.join(" ");
    expect(text).not.toMatch(new RegExp(`개발자명: \\${"["}입력`));
    expect(text).toMatch(/시행일: \d{4}년 \d{1,2}월 \d{1,2}일/);
  });

  it("국외 이전 고지에 법정 항목이 빠짐없이 있다", () => {
    // '제3자 제공' 한 줄로 갈음할 수 없다. 사진이 미국으로 나가므로
    // 이전받는 자·국가·시기와 방법·항목·목적·보유기간을 따로 알려야 한다.
    const section = PRIVACY.find((s) => s.heading === "개인정보의 국외 이전")!;
    const text = section.body.join(" ");
    for (const required of [
      "이전받는 자",
      "이전되는 국가",
      "이전 일시 및 방법",
      "이전되는 항목",
      "이용 목적",
      "보유 및 이용 기간",
    ]) {
      expect(text).toContain(required);
    }
  });

  it("판정 업체를 실제 이름으로 밝힌다", () => {
    // server/app/config.py 의 judge_provider 가 openai 다. 업체를 바꾸면
    // 이 문서도 같이 고쳐야 한다 — 안 고치면 허위 고지다.
    const text = PRIVACY.flatMap((s) => s.body).join(" ");
    expect(text).toContain("OpenAI");
  });
});
