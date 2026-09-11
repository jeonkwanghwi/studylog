import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Capture from "../app/capture";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ kind: "start" }),
}));

jest.mock("expo-camera", () => ({
  CameraView: ({ children }: { children: React.ReactNode }) => children ?? null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("촬영", () => {
  it("통과하면 결과를 보여주고 닫을 수 있다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        result: "pass", photo_id: "p1", reason: "책상에서 공부 중입니다.",
        session: { id: "s1", started_at: "2026-09-10T01:00:00Z", ended_at: null,
                   counted_minutes: 0, status: "open" },
      }),
    } as Response);

    await wrap(<Capture />);
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText(/공부 시작됨/)).toBeTruthy());
  });

  it("거절되면 사유와 재촬영·이의제기를 보여준다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        result: "fail", photo_id: "p9", reason: "게임 화면입니다.", session: null,
      }),
    } as Response);

    await wrap(<Capture />);
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("게임 화면입니다.")).toBeTruthy());
    expect(screen.getByText("다시 찍기")).toBeTruthy();
    expect(screen.getByText("이의제기")).toBeTruthy();
  });

  it("업로드가 실패하면 재시도를 제안한다", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));

    await wrap(<Capture />);
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());
  });
});
