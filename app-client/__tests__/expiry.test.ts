import { expiresAt, needsRefresh, REFRESH_BEFORE_MS } from "../src/auth/expiry";

const DAY = 24 * 60 * 60 * 1000;

function tokenExpiringIn(ms: number, now = Date.now()): string {
  const payload = { sub: "u1", exp: Math.floor((now + ms) / 1000) };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${b64}.signature`;
}

describe("토큰 만료", () => {
  it("만료 시각을 읽는다", () => {
    const now = Date.now();
    const exp = expiresAt(tokenExpiringIn(90 * DAY, now));
    expect(exp).not.toBeNull();
    // 초 단위로 내림하므로 1초 오차를 허용한다.
    expect(Math.abs(exp!.getTime() - (now + 90 * DAY))).toBeLessThan(1000);
  });

  it("갓 발급된 90일 토큰은 아직 갱신하지 않는다", () => {
    expect(needsRefresh(tokenExpiringIn(90 * DAY))).toBe(false);
  });

  it("만료가 가까우면 갱신한다", () => {
    // 60일 미만 남으면 갱신 — 두 달에 한 번만 앱을 열어도 유지된다.
    expect(needsRefresh(tokenExpiringIn(59 * DAY))).toBe(true);
    expect(needsRefresh(tokenExpiringIn(1 * DAY))).toBe(true);
  });

  it("경계에서 갱신하지 않는다", () => {
    expect(needsRefresh(tokenExpiringIn(REFRESH_BEFORE_MS + 1000))).toBe(false);
  });

  it("이미 만료됐으면 시도하지 않는다", () => {
    // 갱신도 401 로 거절당한다. 헛된 호출을 하지 않는다.
    expect(needsRefresh(tokenExpiringIn(-DAY))).toBe(false);
  });

  it("읽을 수 없는 토큰은 건드리지 않는다", () => {
    // 멀쩡한 토큰을 괜히 갈지 않는다.
    expect(needsRefresh("쓰레기")).toBe(false);
    expect(needsRefresh("a.b.c")).toBe(false);
    expect(expiresAt("")).toBeNull();
  });
});
