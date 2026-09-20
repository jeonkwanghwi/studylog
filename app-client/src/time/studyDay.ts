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

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * YYYY-MM-DD 를 "9월 20일 (금)" 으로 읽는다.
 *
 * 기록 목록이 ISO 날짜를 그대로 보여주고 있었다. 개발자에게는 읽히지만
 * 대부분의 사람은 날짜를 그렇게 읽지 않고, 무엇보다 요일이 없으면 자기가
 * 어느 날을 놓쳤는지 가늠할 수 없다.
 */
export function formatStudyDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}
