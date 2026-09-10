import { formatWon } from "../src/money/format";

describe("금액 표기", () => {
  it("천 단위를 끊고 '원' 단위를 붙인다", () => {
    expect(formatWon(7000)).toBe("7,000원");
    expect(formatWon(0)).toBe("0원");
    expect(formatWon(1234567)).toBe("1,234,567원");
  });

  it("음수도 형태를 유지한다", () => {
    expect(formatWon(-2000)).toBe("-2,000원");
  });
});
