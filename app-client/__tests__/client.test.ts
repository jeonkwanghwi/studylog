import { ApiError, api, setTokenGetter } from "../src/api/client";
import { installXhrMock } from "../src/testing/mockXhr";

const json = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);

describe("API 클라이언트", () => {
  beforeEach(() => {
    setTokenGetter(async () => "tok-123");
  });

  it("절대 주소로 부른다", async () => {
    const spy = jest.spyOn(global, "fetch").mockReturnValue(json({ ok: 1 }));
    await api.get("/users/me");
    expect(spy.mock.calls[0][0]).toBe("http://127.0.0.1:8000/users/me");
    spy.mockRestore();
  });

  it("토큰을 Authorization 헤더로 붙인다", async () => {
    const spy = jest.spyOn(global, "fetch").mockReturnValue(json({}));
    await api.get("/users/me");
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-123"
    );
    spy.mockRestore();
  });

  it("토큰이 없으면 헤더를 아예 안 붙인다", async () => {
    setTokenGetter(async () => null);
    const spy = jest.spyOn(global, "fetch").mockReturnValue(json({}));
    await api.post("/auth/social", { provider: "apple" });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    spy.mockRestore();
  });

  it.each([
    [401, "auth"],
    [402, "payment"],
    [403, "forbidden"],
    [404, "notFound"],
    [409, "conflict"],
    [500, "other"],
  ])("%i 를 %s 로 분류한다", async (status, kind) => {
    const spy = jest
      .spyOn(global, "fetch")
      .mockReturnValue(json({ detail: "안내" }, status as number));
    await expect(api.get("/users/me")).rejects.toMatchObject({
      status,
      kind,
      detail: "안내",
    });
    spy.mockRestore();
  });

  it("detail 이 없어도 던진다", async () => {
    const spy = jest.spyOn(global, "fetch").mockReturnValue(json({}, 500));
    await expect(api.get("/x")).rejects.toBeInstanceOf(ApiError);
    spy.mockRestore();
  });

  it("multipart 는 fetch 가 아니라 XHR 로 나가고, Content-Type 을 직접 정하지 않는다", async () => {
    // Expo 가 대체한 fetch 는 RN 의 파일 파트를 전송하지 못한다.
    const xhr = installXhrMock();
    const spy = jest.spyOn(global, "fetch");
    await api.postForm("/sessions/start", new FormData());

    expect(spy).not.toHaveBeenCalled();
    expect(xhr.sent).toHaveLength(1);
    expect(Object.keys(xhr.sent[0].headers)).not.toContain("Content-Type");
    xhr.restore();
    spy.mockRestore();
  });
});
