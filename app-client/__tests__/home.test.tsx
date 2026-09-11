import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";

import Home from "../app/(tabs)/index";

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

  it("챌린지가 있으면 아직 못 받은 돈을 보여준다 (참가비 - 적립액)", async () => {
    renderWithData({
      "/users/me": me,
      "/sessions/current": null,
      "/challenges/current": challenge,
    });
    await waitFor(() => expect(screen.getByText("18,000")).toBeTruthy());
    expect(screen.getByText(/12,000원 확보/)).toBeTruthy();
    expect(screen.queryByText("12,000")).toBeNull();
  });
});
