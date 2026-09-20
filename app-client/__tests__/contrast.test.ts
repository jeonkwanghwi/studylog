import { color, type } from "../src/design/tokens";

/**
 * 색은 고치기 쉽고 무너지기도 쉽다. 실제로 muted 캡션이 3.04, 이차 버튼
 * 라벨이 3.45 로 오래 방치돼 있었다 — 눈으로 봐서는 "좀 흐리네" 정도라
 * 아무도 버그로 부르지 않는다. 화면에 실제로 존재하는 조합만 골라
 * 숫자로 고정한다.
 *
 * WCAG 2.2 기준: 본문 4.5 / 큰 글자(24px 이상 또는 볼드 18.66px 이상) 3.0 /
 * 비텍스트 UI 경계 3.0.
 */
function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = v.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: [string, string, string][] = [
  ["본문", color.text, color.bg],
  ["보조문", color.textSub, color.bg],
  ["캡션(흰 배경)", color.textMuted, color.bg],
  ["캡션(회색 카드 위)", color.textMuted, color.fill],
  ["text 버튼 라벨", color.accentStrong, color.bg],
  ["회색 카드 위 금액", color.accentStrong, color.fill],
  ["회색 카드 위 text 버튼", color.accentStrong, color.fill],
  ["secondary 버튼 라벨", color.accentStrong, color.accentFill],
  ["피드 그룹 칩(선택됨)", color.accentStrong, color.accentSoft],
  ["primary 버튼 라벨", color.bg, color.accent],
  ["danger 버튼 라벨", color.bg, color.negative],
  ["danger 버튼 라벨(누름)", color.bg, color.negativePressed],
  ["뱃지 positive", color.accentStrong, color.accentSoft],
  ["뱃지 negative", color.negative, color.negativeSoft],
  ["달력 확보한 날", color.accentStrong, color.accentFill],
  ["달력 실패한 날", color.negative, color.negativeSoft],
  ["달력 오늘", color.bg, color.accent],
  ["경고 문구", color.negative, color.bg],
  ["어두운 면 본문", color.inkMuted, color.ink],
  ["어두운 면 secondary 라벨", color.inkAccent, color.inkFill],
];

describe("색 대비", () => {
  test.each(TEXT_PAIRS)("%s 은 본문 기준 4.5 를 넘는다", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("입력칸 테두리는 비텍스트 기준 3.0 을 넘는다", () => {
    expect(contrast(color.border, color.bg)).toBeGreaterThanOrEqual(3.0);
  });
});

describe("글자 크기", () => {
  // 모바일 본문 하한은 16px 이 통설이고(iOS HIG 는 17pt 권장, Material 은
  // 14sp 최소·16sp 권장), 캡션에도 꼭 읽어야 하는 문장이 들어간다.
  test("본문은 16px 이상이다", () => {
    expect(type.body.fontSize).toBeGreaterThanOrEqual(16);
  });

  test("가장 작은 글자도 14px 이상이다", () => {
    const smallest = Math.min(...Object.values(type).map((t) => t.fontSize));
    expect(smallest).toBeGreaterThanOrEqual(14);
  });

  test("본문과 section 은 크기로도 구분된다", () => {
    // 16 과 15 처럼 1px 차이는 위계로 읽히지 않는다.
    expect(type.section.fontSize - type.body.fontSize).toBeGreaterThanOrEqual(1);
    expect(type.title.fontSize - type.section.fontSize).toBeGreaterThanOrEqual(2);
  });
});
