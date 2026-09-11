import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import Home from "../app/(tabs)/index";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const me = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 0, credit_balance: 0,
};

function mockApi(payloads: Record<string, unknown>) {
  jest.spyOn(global, "fetch").mockImplementation((url) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    return Promise.resolve({
      ok: true, status: 200, json: async () => payloads[path] ?? null,
    } as Response);
  });
}

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

function Boom(): never {
  throw new Error("터짐");
}

describe("복원력", () => {
  it("앱을 다시 열어도 열린 세션으로 돌아간다", async () => {
    mockApi({
      "/users/me": me,
      "/sessions/current": {
        id: "s1", started_at: "2026-09-10T01:00:00Z", ended_at: null,
        counted_minutes: 0, status: "open",
      },
      "/challenges/current": null,
    });

    await wrap(<Home />);
    // 로컬에 저장된 것이 없어도 서버가 준 세션으로 종료 화면이 살아난다
    await waitFor(() => expect(screen.getByText("공부 종료")).toBeTruthy());
  });

  it("abandoned 세션은 열린 것으로 취급하지 않는다", async () => {
    mockApi({
      "/users/me": me,
      "/sessions/current": {
        id: "s1", started_at: "2026-09-10T01:00:00Z", ended_at: null,
        counted_minutes: 0, status: "abandoned",
      },
      "/challenges/current": null,
    });

    await wrap(<Home />);
    await waitFor(() => expect(screen.getByText("공부 시작")).toBeTruthy());
  });

  it("렌더링이 터져도 흰 화면 대신 안내를 보여준다", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/문제가 발생했습니다/)).toBeTruthy();
  });

  it("바운더리는 정상 자식을 그대로 그린다", async () => {
    await render(
      <ErrorBoundary>
        <Text>정상</Text>
      </ErrorBoundary>
    );
    expect(screen.getByText("정상")).toBeTruthy();
  });
});
