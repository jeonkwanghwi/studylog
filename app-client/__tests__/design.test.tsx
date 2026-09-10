import { render, screen } from "@testing-library/react-native";

import { Amount } from "../src/design/Amount";
import { color, space, type } from "../src/design/tokens";
import { TickStrip } from "../src/design/TickStrip";

describe("토큰", () => {
  it("바탕은 크림색이 아니라 회녹색이다", () => {
    expect(color.ground).toBe("#E4E8E2");
  });

  it("잉크는 무채색 근사흑이 아니라 색을 가진다", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.ink.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(8);
  });

  it("간격은 4의 배수 척도다", () => {
    expect(Object.values(space).every((v) => v % 4 === 0)).toBe(true);
  });

  it("금액은 자릿수를 맞추기 위해 고정폭을 쓴다", () => {
    expect(type.amount.fontFamily).toMatch(/Mono/);
  });

  it("본문은 고정폭을 쓰지 않는다", () => {
    expect(type.body.fontFamily).not.toMatch(/Mono/);
  });
});

describe("눈금 띠", () => {
  it("일수만큼 눈금을 그린다", async () => {
    await render(<TickStrip days={7} marks={Array(7).fill("pending")} />);
    expect(screen.getAllByTestId("tick")).toHaveLength(7);
  });

  it("확보한 날은 형광으로 칠한다", async () => {
    await render(
      <TickStrip days={3} marks={["secured", "missed", "pending"]} />
    );
    const ticks = screen.getAllByTestId("tick");
    expect(ticks[0].props.style.backgroundColor).toBe(color.highlight);
  });

  it("놓친 날은 인주색으로 표시한다", async () => {
    await render(<TickStrip days={3} marks={["secured", "missed", "pending"]} />);
    const ticks = screen.getAllByTestId("tick");
    expect(ticks[1].props.style.backgroundColor).toBe(color.stamp);
  });

  it("아직 오지 않은 날은 비워둔다", async () => {
    await render(<TickStrip days={3} marks={["secured", "missed", "pending"]} />);
    const ticks = screen.getAllByTestId("tick");
    expect(ticks[2].props.style.backgroundColor).toBe("transparent");
  });

  it("marks 가 days 보다 짧으면 나머지를 pending 으로 채운다", async () => {
    await render(<TickStrip days={5} marks={["secured"]} />);
    expect(screen.getAllByTestId("tick")).toHaveLength(5);
  });
});

describe("Amount", () => {
  it("자릿수와 '원' 단위를 별도 노드로 렌더링한다", async () => {
    await render(<Amount value={18000} />);
    expect(screen.getByText("18,000")).toBeTruthy();
    expect(screen.getByText("원")).toBeTruthy();
  });

  it("음수는 부호를 유지한다", async () => {
    await render(<Amount value={-2000} />);
    expect(screen.getByText("-2,000")).toBeTruthy();
    expect(screen.getByText("원")).toBeTruthy();
  });
});
