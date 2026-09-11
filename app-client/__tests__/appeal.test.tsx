import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Appeal from "../app/appeal/[photoId]";

const mockSetOptions = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ photoId: "p1" }),
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Appeal />
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("이의제기", () => {
  it("한 번뿐이라는 사실을 미리 알린다", async () => {
    await wrap();
    expect(screen.getByText(/한 번만/)).toBeTruthy();
  });

  it("설명이 비어 있으면 보내지 않는다", async () => {
    const spy = jest.spyOn(global, "fetch");
    await wrap();
    await fireEvent.press(screen.getByText("다시 판정 요청"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("전송 중에는 모달을 쓸어 내려 나갈 수 없다", async () => {
    // 나가버리면 서버는 그대로 처리해서 유일한 기회가 소모되는데,
    // 인정됐는지 거절됐는지는 영영 못 본다.
    let resolve: (r: Response) => void = () => {};
    jest.spyOn(global, "fetch").mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      })
    );
    await wrap();
    await fireEvent.changeText(screen.getByPlaceholderText(/무엇을 하고 있었는지/), "런닝머신입니다");
    // await 하지 않는다 — fetch 가 아직 안 끝난 상태 그대로를 봐야 한다.
    fireEvent.press(screen.getByText("다시 판정 요청"));

    await waitFor(() =>
      expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false })
    );

    resolve({
      ok: true, status: 200,
      json: async () => ({ result: "pass", photo_id: "p1", reason: "", session: null }),
    } as Response);

    await waitFor(() =>
      expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true })
    );
  });

  it("통과하면 결과를 보여준다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        result: "pass", photo_id: "p1", reason: "태블릿 인강입니다.",
        session: { id: "s1", started_at: "2026-09-10T02:00:00Z", ended_at: null,
                   counted_minutes: 0, status: "open" },
      }),
    } as Response);

    await wrap();
    await fireEvent.changeText(
      screen.getByPlaceholderText(/무엇을 하고 있었는지/),
      "태블릿으로 인강 듣는 중입니다"
    );
    await fireEvent.press(screen.getByText("다시 판정 요청"));

    await waitFor(() => expect(screen.getByText(/인정됐습니다/)).toBeTruthy());
  });

  it("거절되면 최종이라는 것을 분명히 한다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        result: "fail", photo_id: "p1", reason: "여전히 게임 화면입니다.",
        session: null,
      }),
    } as Response);

    await wrap();
    await fireEvent.changeText(screen.getByPlaceholderText(/무엇을 하고 있었는지/), "공부 중");
    await fireEvent.press(screen.getByText("다시 판정 요청"));

    await waitFor(() => expect(screen.getByText(/최종/)).toBeTruthy());
  });

  it("409 는 이미 썼거나 자격이 없다는 뜻이라 안내가 다르다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ detail: "이의제기는 한 번만 가능합니다" }),
    } as Response);

    await wrap();
    await fireEvent.changeText(screen.getByPlaceholderText(/무엇을 하고 있었는지/), "공부 중");
    await fireEvent.press(screen.getByText("다시 판정 요청"));

    await waitFor(() =>
      expect(screen.getByText("이의제기는 한 번만 가능합니다")).toBeTruthy()
    );
  });

  it("404 는 이 사진이 내 것이 아니라는 뜻이라 서버 detail을 그대로 보여준다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ detail: "내 사진이 아닙니다" }),
    } as Response);

    await wrap();
    await fireEvent.changeText(screen.getByPlaceholderText(/무엇을 하고 있었는지/), "공부 중");
    await fireEvent.press(screen.getByText("다시 판정 요청"));

    await waitFor(() => expect(screen.getByText("내 사진이 아닙니다")).toBeTruthy());
  });
});
