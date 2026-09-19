import { uploadPhoto } from "../src/api/upload";
import { installXhrMock, type XhrMock } from "../src/testing/mockXhr";

/**
 * 이 테스트는 **XMLHttpRequest** 를 목킹한다.
 *
 * 전에는 fetch 를 목킹했는데, 실제 업로드는 fetch 를 타지 않는다
 * (Expo 가 대체한 fetch 는 RN 의 파일 파트를 모른다). 그래서 사진 업로드가
 * 실기기에서 통째로 죽어 있는데도 테스트 5개가 전부 초록이었다.
 * 목은 실제로 쓰이는 경로에 걸어야 한다.
 */
let xhr: XhrMock;

beforeEach(() => {
  xhr = installXhrMock();
  jest.spyOn(global, "fetch");
});
afterEach(() => {
  xhr.restore();
  jest.restoreAllMocks();
});
const sent = () => xhr.sent;

describe("사진 업로드", () => {
  it("시작 샷은 /sessions/start 로 간다", async () => {
    await uploadPhoto("start", "file:///tmp/a.jpg", { activity: "공부" });
    expect(sent()[0].url).toBe("http://127.0.0.1:8000/sessions/start");
    expect(sent()[0].method).toBe("POST");
  });

  it("종료 샷은 세션 id 를 경로에 넣는다", async () => {
    await uploadPhoto("end", "file:///tmp/a.jpg", { sessionId: "s1" });
    expect(sent()[0].url).toBe("http://127.0.0.1:8000/sessions/s1/end");
  });

  it("fetch 가 아니라 XHR 로 보낸다", async () => {
    // Expo 가 대체한 fetch 로는 RN 의 파일 파트가 전송되지 않는다.
    await uploadPhoto("start", "file:///tmp/a.jpg", { activity: "공부" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sent()).toHaveLength(1);
  });

  it("Content-Type 을 직접 정하지 않는다 — boundary 는 런타임이 붙인다", async () => {
    await uploadPhoto("start", "file:///tmp/a.jpg", { activity: "공부" });
    expect(Object.keys(sent()[0].headers)).not.toContain("Content-Type");
  });

  it("파일은 RN 의 uri 파트로 붙인다", async () => {
    // 테스트 환경의 FormData 는 표준 구현이라 객체 파트를 문자열로 뭉갠다.
    // 실기기의 RN 구현과 달라서, 무엇을 담았는지는 append 호출로 확인한다.
    const append = jest.spyOn(FormData.prototype, "append");
    await uploadPhoto("start", "file:///tmp/a.jpg", { activity: "  러닝머신 30분  " });

    expect(append).toHaveBeenCalledWith("image", {
      uri: "file:///tmp/a.jpg",
      name: "shot.jpg",
      type: "image/jpeg",
    });
    expect(append).toHaveBeenCalledWith("activity", "러닝머신 30분");
  });

  it("서버가 거절하면 detail 을 그대로 올린다", async () => {
    xhr.reply(409, { detail: "이미 진행 중인 세션이 있습니다" });
    await expect(
      uploadPhoto("start", "file:///tmp/a.jpg", { activity: "공부" })
    ).rejects.toThrow("이미 진행 중인 세션이 있습니다");
  });

  it("종료 샷인데 세션 id 가 없으면 부르기 전에 막는다", async () => {
    await expect(uploadPhoto("end", "file:///tmp/a.jpg")).rejects.toThrow(/세션/);
    expect(sent()).toHaveLength(0);
  });

  it("시작 샷인데 선언이 비어 있으면 부르기 전에 막는다", async () => {
    await expect(
      uploadPhoto("start", "file:///tmp/a.jpg", { activity: "   " })
    ).rejects.toThrow(/선언/);
    expect(sent()).toHaveLength(0);
  });
});
