import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";

import Home from "../app/(tabs)/index";
import { color } from "../src/design/tokens";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function renderWithData(payloads: Record<string, unknown>) {
  jest.spyOn(global, "fetch").mockImplementation((url: RequestInfo | URL) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => payloads[path] ?? null,
    } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>
  );
}

const me = {
  id: "u1",
  nickname: "광휘",
  daily_goal_minutes: 60,
  pending_goal_minutes: null,
  streak_count: 5,
  credit_balance: 12000,
};

const challenge = {
  id: "c1",
  product_id: "challenge_30d_1k",
  entry_amount: 30000,
  daily_payback: 1000,
  completion_bonus: 3000,
  total_days: 30,
  started_on: "2026-09-01",
  ends_on: "2026-09-30",
  paid_with: "iap" as const,
  status: "active" as const,
};

afterEach(() => jest.restoreAllMocks());

describe("홈", () => {
  it("세션이 없으면 시작 버튼을 보여준다", async () => {
    renderWithData({
      "/users/me": me,
      "/sessions/current": null,
      "/challenges/current": null,
    });
    await waitFor(() => expect(screen.getByText("공부 시작")).toBeTruthy());
  });

  it("세션이 열려 있으면 종료 버튼과 경과 시간을 보여준다", async () => {
    const startedAt = new Date(Date.now() - 95 * 60_000).toISOString();
    renderWithData({
      "/users/me": me,
      "/sessions/current": {
        id: "s1",
        started_at: startedAt,
        ended_at: null,
        counted_minutes: 0,
        status: "open",
      },
      "/challenges/current": null,
    });
    await waitFor(() => expect(screen.getByText("공부 종료")).toBeTruthy());
    expect(screen.getByText("1시간 35분")).toBeTruthy();
  });

  it("abandoned·closed 세션은 시작 전 상태로 취급한다", async () => {
    renderWithData({
      "/users/me": me,
      "/sessions/current": {
        id: "s1",
        started_at: "2026-09-10T01:00:00Z",
        ended_at: null,
        counted_minutes: 0,
        status: "abandoned",
      },
      "/challenges/current": null,
    });
    await waitFor(() => expect(screen.getByText("공부 시작")).toBeTruthy());
    expect(screen.queryByText("공부 종료")).toBeNull();
  });

  it("회수가 가까우면 경고한다", async () => {
    const startedAt = new Date(Date.now() - 215 * 60_000).toISOString();
    renderWithData({
      "/users/me": me,
      "/sessions/current": {
        id: "s1",
        started_at: startedAt,
        ended_at: null,
        counted_minutes: 0,
        status: "open",
      },
      "/challenges/current": null,
    });
    await waitFor(() => expect(screen.getByText(/25분 뒤 자동 폐기/)).toBeTruthy());
  });

  it("여유가 있으면 경고하지 않는다", async () => {
    const startedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    renderWithData({
      "/users/me": me,
      "/sessions/current": {
        id: "s1",
        started_at: startedAt,
        ended_at: null,
        counted_minutes: 0,
        status: "open",
      },
      "/challenges/current": null,
    });
    await waitFor(() => expect(screen.getByText("공부 종료")).toBeTruthy());
    expect(screen.queryByText(/자동 폐기/)).toBeNull();
  });

  it("streak 를 보여준다", async () => {
    renderWithData({
      "/users/me": me,
      "/sessions/current": null,
      "/challenges/current": null,
    });
    await waitFor(() => expect(screen.getByText(/5일째/)).toBeTruthy());
  });

  it("챌린지가 없으면 참가를 권한다", async () => {
    renderWithData({
      "/users/me": me,
      "/sessions/current": null,
      "/challenges/current": null,
    });
    await waitFor(() => expect(screen.getByText("챌린지 시작")).toBeTruthy());
  });

  it("챌린지가 있으면 아직 못 받은 돈을 보여준다 (참가비 - 이 챌린지의 적립액)", async () => {
    // credit_balance(12,000)는 크레딧 지갑 전체다 — 이 챌린지가 실제로 돌려준
    // 금액은 이 챌린지 기간(started_on..ends_on) 안의 기록만 합친 것이어야 한다.
    const records = [
      { id: "r1", date: "2026-09-05", total_minutes: 90, goal_minutes: 60,
        result: "success" as const, payback_amount: 1000, streak_snapshot: 5,
        settled_at: "2026-09-06T00:00:00Z" },
      { id: "r2", date: "2026-09-06", total_minutes: 90, goal_minutes: 60,
        result: "success" as const, payback_amount: 1000, streak_snapshot: 6,
        settled_at: "2026-09-07T00:00:00Z" },
      // 챌린지 시작 이전 날짜 — 이 챌린지의 적립으로 세면 안 된다.
      { id: "r0", date: "2026-08-30", total_minutes: 90, goal_minutes: 60,
        result: "success" as const, payback_amount: 1000, streak_snapshot: 1,
        settled_at: "2026-08-31T00:00:00Z" },
    ];
    renderWithData({
      "/users/me": me,
      "/sessions/current": null,
      "/challenges/current": challenge,
      "/records/me?limit=90": records,
    });
    // entry_amount(30,000) - 이 챌린지 안의 적립(2,000) = 28,000
    await waitFor(() => expect(screen.getByText("28,000")).toBeTruthy());
    expect(screen.getByText(/2,000원 확보/)).toBeTruthy();
    expect(screen.queryByText("18,000")).toBeNull();
  });

  it("크레딧 지갑에 남은 돈은 이 챌린지의 적립으로 세지 않는다 — 지난 챌린지의 잔여 크레딧이 새 챌린지를 이미 갚은 것처럼 보이면 안 된다", async () => {
    renderWithData({
      "/users/me": { ...me, credit_balance: 12000 }, // 다른 챌린지에서 남은 크레딧
      "/sessions/current": null,
      "/challenges/current": challenge,
      "/records/me?limit=90": [], // 이 챌린지 안에서는 아직 아무것도 확정되지 않았다
    });
    // 이 챌린지는 아직 하나도 못 받았으니 30,000 전액이 위험에 남아 있어야 한다.
    await waitFor(() => expect(screen.getByText("30,000")).toBeTruthy());
    expect(screen.getByText(/0원 확보/)).toBeTruthy();
  });

  it("스트릭 복구에 크레딧을 써도 이 챌린지의 남은 금액은 움직이지 않는다", async () => {
    const records = [
      { id: "r1", date: "2026-09-05", total_minutes: 90, goal_minutes: 60,
        result: "success" as const, payback_amount: 1000, streak_snapshot: 5,
        settled_at: "2026-09-06T00:00:00Z" },
    ];
    // 복구 전: 크레딧 10,000
    const before = await renderWithData({
      "/users/me": { ...me, credit_balance: 10000 },
      "/sessions/current": null,
      "/challenges/current": challenge,
      "/records/me?limit=90": records,
    });
    await waitFor(() => expect(screen.getByText("29,000")).toBeTruthy());
    await before.unmount();

    // 복구 후: 크레딧 2,000 이 스트릭 복구로 빠져나갔다. 기록도 챌린지도 그대로다.
    renderWithData({
      "/users/me": { ...me, credit_balance: 8000 },
      "/sessions/current": null,
      "/challenges/current": challenge,
      "/records/me?limit=90": records,
    });
    // 여전히 29,000 이어야 한다 — 늘지도 줄지도 않는다.
    await waitFor(() => expect(screen.getByText("29,000")).toBeTruthy());
  });

  it("세션 로딩 중에는 시작/종료 버튼을 보여주지 않는다 — 열린 세션인데 시작 버튼이 잠깐 보이면 탭한 순간 사진과 유료 판정이 헛되이 나간다", async () => {
    let resolveSession: (value: unknown) => void = () => {};
    const sessionPromise = new Promise((resolve) => {
      resolveSession = resolve;
    });
    jest.spyOn(global, "fetch").mockImplementation((url: RequestInfo | URL) => {
      const path = String(url).replace("http://127.0.0.1:8000", "");
      if (path === "/sessions/current") {
        return sessionPromise.then(
          () =>
            ({
              ok: true,
              status: 200,
              json: async () => ({
                id: "s1", started_at: "2026-09-11T01:00:00Z", ended_at: null,
                counted_minutes: 0, status: "open",
              }),
            }) as Response
        );
      }
      const payloads: Record<string, unknown> = { "/users/me": me, "/challenges/current": null };
      return Promise.resolve({ ok: true, status: 200, json: async () => payloads[path] ?? null } as Response);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(
      <QueryClientProvider client={client}>
        <Home />
      </QueryClientProvider>
    );

    expect(screen.queryByText("공부 시작")).toBeNull();
    expect(screen.queryByText("공부 종료")).toBeNull();

    await act(async () => {
      resolveSession(null);
      await sessionPromise;
    });
    await waitFor(() => expect(screen.getByText("공부 종료")).toBeTruthy());
  });

  it("기록에 따라 날짜 칸을 secured/missed/pending 으로 채운다", async () => {
    const records = [
      { id: "r1", date: "2026-09-01", total_minutes: 90, goal_minutes: 60,
        result: "success" as const, payback_amount: 1000, streak_snapshot: 1,
        settled_at: "2026-09-02T00:00:00Z" },
      { id: "r2", date: "2026-09-02", total_minutes: 10, goal_minutes: 60,
        result: "failed" as const, payback_amount: 0, streak_snapshot: 0,
        settled_at: "2026-09-03T00:00:00Z" },
    ];
    renderWithData({
      "/users/me": me,
      "/sessions/current": null,
      "/challenges/current": challenge,
      "/records/me?limit=90": records,
    });

    await waitFor(() => expect(screen.getAllByTestId("day-cell")).toHaveLength(30));
    const cells = screen.getAllByTestId("day-cell");
    expect(cells[0].props.style.backgroundColor).toBe(color.accentSoft); // 09-01 성공 → secured
    expect(cells[1].props.style.backgroundColor).toBe(color.negativeSoft); // 09-02 실패 → missed
    expect(cells[2].props.style.backgroundColor).toBe(color.fill); // 09-03 기록 없음 → pending
  });
});
