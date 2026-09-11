import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Records from "../app/(tabs)/records";
import Restore from "../app/restore/[recordId]";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ recordId: "r1" }),
}));

const HOUR = 3_600_000;

// canRestore 는 실제 Date.now() 를 쓴다 (screen 이 `new Date()`로 now 를 만든다).
// jest.useFakeTimers().setSystemTime() 은 waitFor 의 폴링과 충돌하므로,
// 고정 시각 대신 지금 시각에서의 상대 오프셋으로 픽스처를 만든다.
const records = [
  {
    id: "r1", date: "2026-09-09", total_minutes: 20, goal_minutes: 60,
    result: "failed" as const, payback_amount: 0, streak_snapshot: 0,
    settled_at: new Date(Date.now() - 11 * HOUR).toISOString(), // 11시간 전 — 복구 가능
  },
  {
    id: "r2", date: "2026-09-07", total_minutes: 10, goal_minutes: 60,
    result: "failed" as const, payback_amount: 0, streak_snapshot: 0,
    settled_at: new Date(Date.now() - 30 * HOUR).toISOString(), // 지남
  },
  {
    id: "r3", date: "2026-09-08", total_minutes: 90, goal_minutes: 60,
    result: "success" as const, payback_amount: 1000, streak_snapshot: 3,
    settled_at: new Date(Date.now() - 12 * HOUR).toISOString(),
  },
];

const me = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 0, credit_balance: 5000,
};

function mockApi(overrides: Record<string, unknown> = {}) {
  jest.spyOn(global, "fetch").mockImplementation((url) => {
    const path = String(url).replace("http://127.0.0.1:8000", "").split("?")[0];
    const body =
      overrides[path] ?? { "/records/me": records, "/users/me": me }[path] ?? null;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
}

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("기록", () => {
  it("성공한 날의 적립액을 보여준다", async () => {
    mockApi();
    // <Amount>는 '₩'를 쓰지 않는다 — 숫자와 '원' 단위를 별도 노드로 그린다.
    await wrap(<Records />);
    await waitFor(() => expect(screen.getByText("1,000")).toBeTruthy());
  });

  it("24시간 안의 실패한 날에만 복구 버튼이 뜬다", async () => {
    mockApi();
    await wrap(<Records />);
    await waitFor(() => expect(screen.getAllByText("복구하기")).toHaveLength(1));
  });

  it("크레딧이 모자라면 복구 버튼 대신 부족 안내를 한다", async () => {
    mockApi({ "/users/me": { ...me, credit_balance: 500 } });
    await wrap(<Records />);
    await waitFor(() => expect(screen.getByText(/크레딧이 부족/)).toBeTruthy());
    expect(screen.queryByText("복구하기")).toBeNull();
  });

  it("기록이 없으면 초대하는 말투로 안내한다", async () => {
    mockApi({ "/records/me": [] });
    await wrap(<Records />);
    await waitFor(() => expect(screen.getByText(/아직 기록이 없습니다/)).toBeTruthy());
  });

  it("기록을 불러오는 동안에는 빈 화면 안내를 먼저 보여주지 않는다", async () => {
    let resolveRecords: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveRecords = resolve;
    });
    jest.spyOn(global, "fetch").mockImplementation((url) => {
      const path = String(url).replace("http://127.0.0.1:8000", "").split("?")[0];
      if (path === "/records/me") {
        return pending.then(() => ({ ok: true, status: 200, json: async () => [] }) as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => (path === "/users/me" ? me : null) } as Response);
    });

    await wrap(<Records />);
    expect(screen.queryByText(/아직 기록이 없습니다/)).toBeNull();
    expect(screen.queryByText("기록")).toBeNull();

    await act(async () => {
      resolveRecords(null);
      await pending;
    });
    await waitFor(() => expect(screen.getByText(/아직 기록이 없습니다/)).toBeTruthy());
  });
});

describe("복구", () => {
  it("페이백은 돌아오지 않는다는 것을 분명히 한다", async () => {
    mockApi();
    await wrap(<Restore />);
    expect(screen.getByText(/페이백은 돌아오지 않습니다/)).toBeTruthy();
  });

  it("성공하면 복원된 streak 를 보여준다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        id: "r1", date: "2026-09-09", total_minutes: 20, goal_minutes: 60,
        result: "passed", payback_amount: 0, streak_snapshot: 7,
        settled_at: "2026-09-09T19:00:00Z",
      }),
    } as Response);

    await wrap(<Restore />);
    // formatWon(2000) === "2,000원" — '₩' 문자는 쓰지 않는다.
    await fireEvent.press(screen.getByText("2,000원으로 복구"));
    await waitFor(() => expect(screen.getByText(/7일/)).toBeTruthy());
  });

  it("402 는 크레딧 부족이라 안내가 다르다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 402,
      json: async () => ({ detail: "크레딧이 부족합니다" }),
    } as Response);

    await wrap(<Restore />);
    await fireEvent.press(screen.getByText("2,000원으로 복구"));
    await waitFor(() => expect(screen.getByText("크레딧이 부족합니다")).toBeTruthy());
  });

  it("409 는 이미 처리됐거나 기한이 지났다는 뜻이라 안내가 다르다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ detail: "이미 복구했거나 기한이 지났습니다" }),
    } as Response);

    await wrap(<Restore />);
    await fireEvent.press(screen.getByText("2,000원으로 복구"));
    await waitFor(() =>
      expect(screen.getByText("이미 복구했거나 기한이 지났습니다")).toBeTruthy()
    );
  });

  it("404 는 내 기록이 아니라는 뜻이라 안내가 다르다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ detail: "내 기록이 아닙니다" }),
    } as Response);

    await wrap(<Restore />);
    await fireEvent.press(screen.getByText("2,000원으로 복구"));
    await waitFor(() => expect(screen.getByText("내 기록이 아닙니다")).toBeTruthy());
  });
});
