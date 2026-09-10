export function formatWon(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}₩${Math.abs(amount).toLocaleString("ko-KR")}`;
}
