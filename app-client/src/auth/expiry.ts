/**
 * JWT 의 만료 시각만 읽는다. 서명은 검증하지 않는다 — 그건 서버 몫이고,
 * 여기서 알고 싶은 건 "슬슬 갱신할 때인가" 하나뿐이다.
 */
export function expiresAt(token: string): Date | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    // base64url → base64. atob 는 RN 에 있다.
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json).exp;
    return typeof exp === "number" ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

/** 만료 60일 전부터 갱신한다. 두 달에 한 번만 앱을 열어도 유지된다. */
export const REFRESH_BEFORE_MS = 60 * 24 * 60 * 60 * 1000;

export function needsRefresh(token: string, now: Date = new Date()): boolean {
  const exp = expiresAt(token);
  // 만료 시각을 못 읽으면 건드리지 않는다. 멀쩡한 토큰을 괜히 갈지 않는다.
  if (exp === null) return false;
  // 이미 만료됐으면 갱신도 거절당한다 — 시도해봐야 401 만 받는다.
  if (exp.getTime() <= now.getTime()) return false;
  return exp.getTime() - now.getTime() < REFRESH_BEFORE_MS;
}
