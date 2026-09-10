/** 세션 상한. 서버의 session_max_minutes 와 같아야 한다. */
export const SESSION_MAX_MINUTES = 240;

/**
 * 서버가 준 시작 시각으로부터 흐른 분. 앱은 시간을 세지 않고 빼기만 한다.
 * 기기 시계가 과거로 조작돼도 음수가 나오지 않는다 — 어차피 정산은
 * 서버가 하므로 여기서 음수를 내봐야 화면만 깨진다.
 */
export function elapsedMinutes(startedAtIso: string, now: Date): number {
  const started = new Date(startedAtIso).getTime();
  const diffMs = now.getTime() - started;
  return Math.max(0, Math.floor(diffMs / 60_000));
}

export function formatElapsed(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  if (rest === 0) return `${hours}시간`;
  return `${hours}시간 ${rest}분`;
}

/** 4시간 자동 회수까지 남은 분. */
export function remainingBeforeForfeit(
  startedAtIso: string,
  now: Date
): number {
  return Math.max(0, SESSION_MAX_MINUTES - elapsedMinutes(startedAtIso, now));
}
