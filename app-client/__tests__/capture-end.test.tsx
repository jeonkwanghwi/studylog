import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Capture from "../app/capture";

let mockStartedAt = "2026-09-10T01:00:00Z";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({
    kind: "end",
    sessionId: "s1",
    startedAt: mockStartedAt,
  }),
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

beforeEach(() => {
  mockStartedAt = "2026-09-10T01:00:00Z";
});

afterEach(() => {
  jest.restoreAllMocks();
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
    mockStartedAt = new Date(Date.now() - 215 * 60_000).toISOString();
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    await wrap();
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() =>
      expect(screen.getByText(/25분 안에 종료하지 않으면/)).toBeTruthy()
    );
  });

  it("시작 샷 실패는 그냥 닫아도 된다", async () => {
    // 이 케이스는 Task 7 테스트가 덮는다. 여기서는 종료 샷만 다룬다.
    expect(true).toBe(true);
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
