const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_START_HOUR = 4;

/**
 * 이 시각이 속한 '공부 하루'를 YYYY-MM-DD 로 준다. 경계는 04:00 KST다.
 * 자정 기준으로 자르면 밤샘 공부가 전날로 잘못 잡힌다.
 */
export function studyDayOf(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  if (kst.getUTCHours() < DAY_START_HOUR) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }
  return kst.toISOString().slice(0, 10);
}
