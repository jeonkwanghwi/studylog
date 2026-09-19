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

  it("신원과 문의처는 아직 비어 있다 — 지어내지 않았다", () => {
    const operator = TERMS.find((s) => s.heading === "운영자 정보")!;
    const needed = operator.body.filter((line) => line.includes(NEEDS_INPUT));
    expect(needed.length).toBeGreaterThanOrEqual(3);   // 개발자명, 문의, 시행일
  });
});
