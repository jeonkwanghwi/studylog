import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Capture from "../app/capture";
import { installXhrMock, type XhrMock } from "../src/testing/mockXhr";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ kind: "start", activity: "수학 문제집" }),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

// 목이 ref 를 넘기지 않으면 takePictureAsync 경로가 한 번도 실행되지 않는다.
// 실제로 "사진이 없는 채로 업로드해서 네이티브가 죽는" 버그를 이 목이
// 가리고 있었다.
jest.mock("expo-camera", () => {
  const { forwardRef, useImperativeHandle } = require("react");
  return {
    CameraView: forwardRef(
      ({ children }: { children?: React.ReactNode }, ref: unknown) => {
        useImperativeHandle(ref, () => ({
          takePictureAsync: async () => ({ uri: "file:///tmp/shot.jpg" }),
        }));
        return children ?? null;
      }
    ),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );

let xhr: XhrMock;
beforeEach(() => {
  xhr = installXhrMock();
});
afterEach(() => {
  xhr.restore();
  jest.restoreAllMocks();
});

describe("촬영", () => {
  it("통과하면 결과를 보여주고 닫을 수 있다", async () => {
    xhr.reply(200, {
      result: "pass", photo_id: "p1", reason: "책상에서 공부 중입니다.",
      session: { id: "s1", started_at: "2026-09-10T01:00:00Z", ended_at: null,
                 counted_minutes: 0, status: "open" },
    });

    await wrap(<Capture />);
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText(/공부 시작됨/)).toBeTruthy());
  });

  it("거절되면 사유와 재촬영·이의제기를 보여준다", async () => {
    xhr.reply(200, { result: "fail", photo_id: "p9", reason: "게임 화면입니다.", session: null });

    await wrap(<Capture />);
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("게임 화면입니다.")).toBeTruthy());
    expect(screen.getByText("다시 찍기")).toBeTruthy();
    expect(screen.getByText("이의제기")).toBeTruthy();
  });

  it("업로드가 실패하면 재시도를 제안한다", async () => {
    // 네트워크 실패는 XHR 의 onerror 로 온다.
    class FailingXHR {
      onerror: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      send() {
        this.onerror?.();
      }
    }
    (global as { XMLHttpRequest?: unknown }).XMLHttpRequest = FailingXHR;

    await wrap(<Capture />);
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());
  });
});
