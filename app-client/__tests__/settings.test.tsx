import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import Settings from "../app/(tabs)/settings";
import { registerPushToken } from "../src/notifications/register";
import type { UserOut } from "../src/api/types";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock("expo-secure-store");
jest.mock("../src/notifications/register", () => ({ registerPushToken: jest.fn() }));

const me: UserOut = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 3, credit_balance: 4000,
};

function mockApi(user: UserOut = me) {
  jest.spyOn(global, "fetch").mockImplementation((_url, init) =>
    Promise.resolve({
      ok: true, status: 200,
      json: async () =>
        (init as RequestInit | undefined)?.method === "PATCH"
          ? { ...user, pending_goal_minutes: 90 }
          : user,
    } as Response)
  );
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Settings />
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("설정", () => {
  it("현재 목표를 보여준다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByDisplayValue("60")).toBeTruthy());
  });

  it("목표를 바꾸면 내일부터 적용된다고 알린다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByDisplayValue("60")).toBeTruthy());

    await fireEvent.changeText(screen.getByDisplayValue("60"), "90");
    await fireEvent.press(screen.getByText("목표 저장"));

    await waitFor(() =>
      expect(screen.getByText(/내일부터 90분/)).toBeTruthy()
    );
  });

  it("예약된 변경이 있으면 그것도 보여준다", async () => {
    mockApi({ ...me, pending_goal_minutes: 120 });
    await wrap();
    await waitFor(() =>
      expect(screen.getByText(/내일부터 120분/)).toBeTruthy()
    );
  });

  it("범위를 벗어난 값은 보내지 않는다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByDisplayValue("60")).toBeTruthy());

    await fireEvent.changeText(screen.getByDisplayValue("60"), "0");
    await fireEvent.press(screen.getByText("목표 저장"));

    const patched = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH"
    );
    expect(patched).toHaveLength(0);
  });

  it("목표 저장이 서버에서 실패하면 실패를 알린다", async () => {
    jest.spyOn(global, "fetch").mockImplementation((_url, init) =>
      Promise.resolve(
        (init as RequestInit | undefined)?.method === "PATCH"
          ? ({ ok: false, status: 500, json: async () => ({ detail: "서버 오류" }) } as Response)
          : ({ ok: true, status: 200, json: async () => me } as Response)
      )
    );
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await wrap();
    await waitFor(() => expect(screen.getByDisplayValue("60")).toBeTruthy());

    await fireEvent.changeText(screen.getByDisplayValue("60"), "90");
    await fireEvent.press(screen.getByText("목표 저장"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("목표 저장 실패", "서버 오류"));
  });

  it("알림 재설정 결과를 알려준다 — 성공", async () => {
    mockApi();
    (registerPushToken as jest.Mock).mockResolvedValue(true);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await wrap();
    await waitFor(() => expect(screen.getByDisplayValue("60")).toBeTruthy());

    await fireEvent.press(screen.getByText("알림 다시 설정"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("알림 설정됨", expect.any(String)));
  });

  it("알림 재설정 결과를 알려준다 — 실패", async () => {
    mockApi();
    (registerPushToken as jest.Mock).mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await wrap();
    await waitFor(() => expect(screen.getByDisplayValue("60")).toBeTruthy());

    await fireEvent.press(screen.getByText("알림 다시 설정"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("알림을 설정하지 못했습니다", expect.any(String))
    );
  });
});
