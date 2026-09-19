import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import Onboarding from "../app/onboarding";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("../src/auth/storage", () => ({ markOnboarded: jest.fn() }));
jest.mock("../src/notifications/register", () => ({
  registerPushToken: jest.fn(() => Promise.resolve(true)),
}));

const me = {
  id: "u1", nickname: "스터디로그", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 0, credit_balance: 0,
};

function mockApi() {
  jest.spyOn(global, "fetch").mockImplementation((url, init) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    const body =
      init && (init as RequestInit).method === "PATCH"
        ? { ...me, nickname: JSON.parse(String((init as RequestInit).body)).nickname ?? me.nickname }
        : me;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Onboarding />
    </QueryClientProvider>
  );

const patched = () =>
  (global.fetch as jest.Mock).mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "PATCH"
  );

afterEach(() => jest.restoreAllMocks());

describe("온보딩", () => {
  it("이름을 먼저 묻는다 — 소셜 로그인이 준 기본 이름을 그대로 쓰면 안 된다", async () => {
    mockApi();
    await wrap();
    expect(screen.getByPlaceholderText("이름 또는 별명")).toBeTruthy();
    expect(screen.getByText(/친구들에게 보이는 이름/)).toBeTruthy();
  });

  it("이름이 비면 아무것도 저장하지 않는다", async () => {
    // 조용히 넘어가면 모든 유저가 "스터디로그"라는 이름으로 피드에 뜬다.
    mockApi();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await wrap();

    await fireEvent.press(screen.getByText("시작하기"));

    expect(alertSpy).toHaveBeenCalledWith("이름을 입력해주세요", expect.anything());
    expect(patched()).toHaveLength(0);
  });

  it("이름을 다듬어 저장하고 목표까지 보낸다", async () => {
    mockApi();
    await wrap();

    await fireEvent.changeText(screen.getByPlaceholderText("이름 또는 별명"), "  광휘  ");
    await fireEvent.press(screen.getByText("시작하기"));

    await waitFor(() => expect(patched()).toHaveLength(2));
    const bodies = patched().map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies[0]).toEqual({ nickname: "광휘" });
    expect(bodies[1]).toEqual({ minutes: 60 });
  });

  it("목표가 범위를 벗어나면 이름도 저장하지 않는다", async () => {
    mockApi();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await wrap();

    await fireEvent.changeText(screen.getByPlaceholderText("이름 또는 별명"), "광휘");
    await fireEvent.changeText(screen.getAllByDisplayValue("60")[0], "0");
    await fireEvent.press(screen.getByText("시작하기"));

    expect(alertSpy).toHaveBeenCalledWith("목표를 확인해주세요", expect.anything());
    expect(patched()).toHaveLength(0);
  });
});
