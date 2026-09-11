import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";
import { BackHandler } from "react-native";

import Capture from "../app/capture";

const mockSetOptions = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
  useNavigation: () => ({ setOptions: mockSetOptions }),
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
  mockSetOptions.mockClear();
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

  it("404 는 이 세션이 더 이상 열려 있지 않다는 뜻이라 재시도 대신 나갈 방법을 준다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ detail: "세션을 찾을 수 없습니다" }),
    } as Response);
    await wrap();
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("세션을 찾을 수 없습니다")).toBeTruthy());
    // 재시도로는 절대 뚫리지 않으니 "다시 시도"를 주면 안 되고, 나갈 방법(확인)을 줘야 한다.
    expect(screen.queryByText("다시 시도")).toBeNull();
    expect(screen.getByText("확인")).toBeTruthy();
  });

  describe("하드웨어 뒤로가기", () => {
    it("종료 샷이 재시도 가능한 오류 상태일 때는 뒤로가기를 삼킨다", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
      const addEventListenerSpy = jest.spyOn(BackHandler, "addEventListener");
      await wrap();
      fireEvent.press(screen.getByText("촬영"));
      await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());

      const call = addEventListenerSpy.mock.calls.find(([name]) => name === "hardwareBackPress");
      expect(call).toBeTruthy();
      const handler = call?.[1] as () => boolean;
      expect(handler()).toBe(true);
    });

    it("촬영 준비 화면(다른 상태)에서는 뒤로가기를 막지 않는다", async () => {
      const addEventListenerSpy = jest.spyOn(BackHandler, "addEventListener");
      await wrap();

      expect(
        addEventListenerSpy.mock.calls.some(([name]) => name === "hardwareBackPress")
      ).toBe(false);
    });

    it("404(재시도 불가) 상태에서는 뒤로가기를 막지 않는다 — 나갈 방법이 있어야 한다", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: false, status: 404,
        json: async () => ({ detail: "세션을 찾을 수 없습니다" }),
      } as Response);
      const addEventListenerSpy = jest.spyOn(BackHandler, "addEventListener");
      await wrap();
      fireEvent.press(screen.getByText("촬영"));
      await waitFor(() => expect(screen.getByText("확인")).toBeTruthy());

      expect(
        addEventListenerSpy.mock.calls.some(([name]) => name === "hardwareBackPress")
      ).toBe(false);
    });

    it("언마운트되면 리스너를 지운다 — 안 지우면 이 모달이 닫힌 뒤에도 앱 전체의 뒤로가기가 먹통이 된다", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
      const removeMock = jest.fn();
      jest.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove: removeMock });

      const view = await wrap();
      fireEvent.press(screen.getByText("촬영"));
      await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());
      expect(removeMock).not.toHaveBeenCalled();

      await view.unmount();
      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("iOS 스와이프 제스처 — BackHandler 와 같은 조건 하나로 통제한다", () => {
    it("촬영 준비 화면(시작 경로 포함)에서는 제스처를 막지 않는다", async () => {
      await wrapStart();
      await waitFor(() => expect(mockSetOptions).toHaveBeenCalledWith({ gestureEnabled: true }));
    });

    it("종료 샷이 재시도 가능한 오류 상태일 때는 제스처를 막는다", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
      await wrap();
      fireEvent.press(screen.getByText("촬영"));

      await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());
      expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
    });

    it("404(재시도 불가) 상태에서는 제스처를 다시 허용한다 — 나갈 방법이 있어야 한다", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: false, status: 404,
        json: async () => ({ detail: "세션을 찾을 수 없습니다" }),
      } as Response);
      await wrap();
      fireEvent.press(screen.getByText("촬영"));

      await waitFor(() => expect(screen.getByText("확인")).toBeTruthy());
      expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
    });
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
