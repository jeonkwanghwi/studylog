import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import Capture from "../app/capture";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

jest.mock("expo-camera", () => ({
  CameraView: ({ children }: { children: React.ReactNode }) => children ?? null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Capture />
    </QueryClientProvider>
  );

/** 시작 샷 경로. useLocalSearchParams 모킹을 kind="start" 로 바꿔 렌더한다. */
const wrapStart = () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ kind: "start" });
  return wrap();
};

beforeEach(() => {
  jest.mocked(useLocalSearchParams).mockReturnValue({
    kind: "end",
    sessionId: "s1",
    startedAt: "2026-09-10T01:00:00Z",
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("종료 샷 실패", () => {
  it("닫기를 제공하지 않는다 — 닫으면 세션이 날아간다", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    await wrap();
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());
    expect(screen.queryByText("확인")).toBeNull();
    expect(screen.queryByText("닫기")).toBeNull();
  });

  it("회수까지 남은 시간을 경고한다", async () => {
    // 4시간(240분) 중 215분이 지난 시점 — 25분 남아야 한다.
    jest.mocked(useLocalSearchParams).mockReturnValue({
      kind: "end",
      sessionId: "s1",
      startedAt: new Date(Date.now() - 215 * 60_000).toISOString(),
    });
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    await wrap();
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() =>
      expect(screen.getByText(/25분 안에 종료하지 않으면/)).toBeTruthy()
    );
  });

  it("시작 샷 실패는 닫을 수 있다", async () => {
    // 같은 error 분기가 kind 에 따라 갈린다. 시작 샷에서 닫기가 살아있는지
    // 여기서 함께 확인해야, 나중에 누가 분기를 합쳐도 테스트가 잡는다.
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    await wrapStart();
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());
    expect(screen.getByText("닫기")).toBeTruthy();
    expect(screen.queryByText(/오늘 기록이 사라집니다/)).toBeNull();
  });

  it("재시도해서 성공하면 종료 결과를 보여준다", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          result: "pass", photo_id: "p2", reason: "노트 필기입니다.",
          session: { id: "s1", started_at: "2026-09-10T01:00:00Z",
                     ended_at: "2026-09-10T02:35:00Z", counted_minutes: 95,
                     status: "closed" },
        }),
      } as Response);

    await wrap();
    fireEvent.press(screen.getByText("촬영"));
    await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());

    fireEvent.press(screen.getByText("다시 시도"));
    await waitFor(() => expect(screen.getByText(/공부 종료됨/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
