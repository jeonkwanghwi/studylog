import { formatWon } from "../src/money/format";

describe("금액 표기", () => {
  it("천 단위를 끊고 원화 기호를 붙인다", () => {
    expect(formatWon(7000)).toBe("₩7,000");
    expect(formatWon(0)).toBe("₩0");
    expect(formatWon(1234567)).toBe("₩1,234,567");
  });

  it("음수도 형태를 유지한다", () => {
    expect(formatWon(-2000)).toBe("-₩2,000");
  });
});
