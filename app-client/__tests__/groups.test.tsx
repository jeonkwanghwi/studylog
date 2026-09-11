import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import Groups from "../app/groups/index";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));

const Clipboard = jest.requireMock("expo-clipboard") as { setStringAsync: jest.Mock };

const groups = [{ id: "g1", name: "고시반", invite_code: "A3K9P2" }];

function mockApi(
  list = groups,
  postResponse: { ok: boolean; status: number; body: unknown } = {
    ok: true,
    status: 200,
    body: { id: "g2", name: "새 그룹", invite_code: "ZZZZZZ" },
  }
) {
  jest.spyOn(global, "fetch").mockImplementation((url, init) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    if ((init as RequestInit | undefined)?.method === "POST") {
      return Promise.resolve({
        ok: postResponse.ok,
        status: postResponse.status,
        json: async () => postResponse.body,
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => (path === "/groups" ? list : null),
    } as Response);
  });
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Groups />
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("그룹", () => {
  it("내 그룹과 초대코드를 보여준다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());
    expect(screen.getByText("A3K9P2")).toBeTruthy();
  });

  it("그룹이 없으면 만들거나 참여하라고 안내한다", async () => {
    mockApi([]);
    await wrap();
    await waitFor(() => expect(screen.getByText(/아직 그룹이 없습니다/)).toBeTruthy());
  });

  it("초대코드 입력을 대문자로 정규화한다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    const input = screen.getByPlaceholderText("초대코드 6자리");
    await fireEvent.changeText(input, "a3k9p2");
    expect(input.props.value).toBe("A3K9P2");
  });

  it("6자리가 아니면 참여를 보내지 않는다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    await fireEvent.changeText(screen.getByPlaceholderText("초대코드 6자리"), "ABC");
    await fireEvent.press(screen.getByText("참여"));

    const posted = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(posted).toHaveLength(0);
  });

  it("이름이 비면 생성을 보내지 않는다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    await fireEvent.press(screen.getByText("그룹 만들기"));
    const posted = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(posted).toHaveLength(0);
  });

  // 브리프 테스트가 다루지 않는 부분: 아래 세 개는 로드베어링 요구사항
  // 3(이미 가입한 그룹 참여는 실패가 아니다)과 4(서버 detail을 그대로 보여준다),
  // 그리고 카드 탭 → 클립보드 복사 동작을 직접 검증한다.

  it("카드를 누르면 초대코드를 클립보드에 복사한다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    await fireEvent.press(screen.getByText("고시반"));
    await waitFor(() =>
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining("A3K9P2"))
    );
  });

  it("이미 가입한 그룹에 참여해도 실패로 취급하지 않는다", async () => {
    // 서버는 중복 참여를 200으로 멱등 처리한다. 실패 알림이 뜨면 안 된다.
    mockApi(groups, { ok: true, status: 200, body: groups[0] });
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    await fireEvent.changeText(screen.getByPlaceholderText("초대코드 6자리"), "A3K9P2");
    await fireEvent.press(screen.getByText("참여"));

    await waitFor(() => expect(screen.getByPlaceholderText("초대코드 6자리").props.value).toBe(""));
    expect(alertSpy).not.toHaveBeenCalledWith("참여 실패", expect.anything());
  });

  it("초대코드 복사는 Alert 대신 토스트로 알린다", async () => {
    // 되돌릴 것도 없고 놓쳐도 그만인 확인이다. 화면을 막고 확인 탭을 요구하면 안 된다.
    mockApi();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    await fireEvent.press(screen.getByText("고시반"));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      "스터디로그 초대코드: A3K9P2"
    );

    await waitFor(() => expect(screen.getByText("초대코드를 복사했어요")).toBeTruthy());
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("참여 실패 시 서버 detail을 그대로 보여준다", async () => {
    mockApi(groups, { ok: false, status: 404, body: { detail: "존재하지 않는 초대코드입니다." } });
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    await fireEvent.changeText(screen.getByPlaceholderText("초대코드 6자리"), "ZZZZZZ");
    await fireEvent.press(screen.getByText("참여"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("참여 실패", "존재하지 않는 초대코드입니다.")
    );
  });
});
