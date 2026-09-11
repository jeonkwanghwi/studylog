export function formatWon(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.abs(amount).toLocaleString("ko-KR")}원`;
}

/** streak 복구 비용. 서버의 복구 가격과 같아야 한다. */
export const RESTORE_COST = 2000;
