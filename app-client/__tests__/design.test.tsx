import { render, screen } from "@testing-library/react-native";

import { Amount } from "../src/design/Amount";
import { DayGrid } from "../src/design/DayGrid";
import { color, space, type } from "../src/design/tokens";

describe("토큰", () => {
  it("바탕은 흰색이다", () => {
    expect(color.bg).toBe("#FFFFFF");
  });

  it("강조색은 단 하나의 파랑이다", () => {
    expect(color.accent).toBe("#2B6CF6");
  });

  it("간격은 4의 배수 척도다", () => {
    expect(Object.values(space).every((v) => v % 4 === 0)).toBe(true);
  });

  it("어떤 타입 토큰도 고정폭(Mono)을 쓰지 않는다", () => {
    Object.values(type).forEach((entry) => {
      expect(entry.fontFamily).not.toMatch(/Mono/);
    });
  });

  it("모든 타입 토큰은 음수 자간을 가진다", () => {
    Object.values(type).forEach((entry) => {
      expect(entry.letterSpacing).toBeLessThan(0);
    });
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

  it("₩ 기호는 절대 쓰지 않는다", async () => {
    await render(<Amount value={18000} />);
    expect(screen.queryByText(/₩/)).toBeNull();
  });
});

describe("DayGrid", () => {
  it("days 만큼 칸을 그린다", async () => {
    await render(<DayGrid start="2026-09-01" days={7} marks={Array(7).fill("pending")} />);
    expect(screen.getAllByTestId("day-cell")).toHaveLength(7);
  });

  it("start 부터 일수(day-of-month)를 라벨로 붙인다", async () => {
    await render(<DayGrid start="2026-09-01" days={5} marks={Array(5).fill("pending")} />);
    ["1", "2", "3", "4", "5"].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it("월을 넘어가는 start 도 올바른 일자를 라벨로 붙인다", async () => {
    await render(<DayGrid start="2026-09-29" days={3} marks={Array(3).fill("pending")} />);
    ["29", "30", "1"].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it("marks 가 days 보다 짧으면 나머지를 pending 으로 채운다", async () => {
    await render(<DayGrid start="2026-09-01" days={5} marks={["secured"]} />);
    const cells = screen.getAllByTestId("day-cell");
    expect(cells).toHaveLength(5);
    expect(cells[1].props.style.backgroundColor).toBe(color.fill);
    expect(cells[4].props.style.backgroundColor).toBe(color.fill);
  });

  it("secured/missed/pending/today 를 서로 다른 배경으로 구분한다", async () => {
    await render(
      <DayGrid
        start="2026-09-01"
        days={4}
        marks={["secured", "missed", "pending", "pending"]}
        today="2026-09-04"
      />
    );
    const cells = screen.getAllByTestId("day-cell");
    const backgrounds = cells.map((cell) => cell.props.style.backgroundColor);

    expect(backgrounds[0]).toBe(color.accentSoft);
    expect(backgrounds[1]).toBe("#FEECEE");
    expect(backgrounds[2]).toBe(color.fill);
    expect(backgrounds[3]).toBe(color.accent);
    expect(new Set(backgrounds).size).toBe(4);
  });

  it("확보된 날이 오늘이면 secured 가 아니라 today 로 렌더링한다", async () => {
    await render(
      <DayGrid start="2026-09-01" days={1} marks={["secured"]} today="2026-09-01" />
    );
    const cell = screen.getByTestId("day-cell");
    expect(cell.props.style.backgroundColor).toBe(color.accent);
    expect(cell.props.style.backgroundColor).not.toBe(color.accentSoft);
  });
});
