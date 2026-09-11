import { uploadPhoto } from "../src/api/upload";

describe("사진 업로드", () => {
  beforeEach(() => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ result: "pass", photo_id: "p1", reason: "", session: null }),
    } as Response);
  });
  afterEach(() => jest.restoreAllMocks());

  it("시작 샷은 /sessions/start 로 간다", async () => {
    await uploadPhoto("start", "file:///tmp/a.jpg");
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/sessions/start"
    );
  });

  it("종료 샷은 세션 id 를 경로에 넣는다", async () => {
    await uploadPhoto("end", "file:///tmp/a.jpg", "s1");
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/sessions/s1/end"
    );
  });

  it("종료 샷인데 세션 id 가 없으면 부르기 전에 막는다", async () => {
    await expect(uploadPhoto("end", "file:///tmp/a.jpg")).rejects.toThrow(
      /세션/
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("image 라는 이름으로 붙인다", async () => {
    await uploadPhoto("start", "file:///tmp/a.jpg");
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get("image")).toBeTruthy();
  });
});
