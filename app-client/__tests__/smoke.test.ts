import { apiBaseUrl } from "../src/config";

describe("설정", () => {
  it("EXPO_PUBLIC_API_URL 을 읽는다", () => {
    expect(apiBaseUrl()).toBe("http://127.0.0.1:8000");
  });

  it("주소가 없으면 조용히 넘어가지 않고 던진다", () => {
    const saved = process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_API_URL;
    expect(() => apiBaseUrl()).toThrow(/EXPO_PUBLIC_API_URL/);
    process.env.EXPO_PUBLIC_API_URL = saved;
  });
});
