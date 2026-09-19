export const color = {
  bg: "#FFFFFF",
  fill: "#F2F4F6", // 카드·입력 배경
  fillStrong: "#E5E8EB", // 눌림·구분
  text: "#191F28", // 본문
  textSub: "#4E5968", // 보조
  textMuted: "#8B95A1", // 3차
  accent: "#2B6CF6", // 단 하나의 강조색
  accentSoft: "#E8F0FE", // 강조색 배경
  // 확보한 날 칸. accentSoft 로는 대기 칸(fill)과 대비가 1.04 라 진행
  // 상황이 한눈에 안 보였다. 확보한 날이 띠처럼 이어져 보여야 한다.
  accentSecured: "#CFDEFC",
  accentStrong: "#1B4FBF", // 위 배경 위의 글자. 대비 5.32 (AA 통과)
  negative: "#F04452", // 잃은 돈
  negativeSoft: "#FEECEE", // 잃은 돈 배경
  line: "#F2F4F6",          // 구분선. 장식이라 옅어도 된다
  // 버튼 테두리. WCAG 1.4.11 은 비텍스트 UI 요소에 배경 대비 3.0 을
  // 요구한다. fillStrong(1.23)으로는 버튼이 배경에 묻혀 안 보인다.
  border: "#8B95A1",        // 대비 3.04
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

export const radius = {
  chip: 8,
  button: 14,
  card: 16,
  pill: 999,
} as const;

const REGULAR = "Pretendard-Regular";
const MEDIUM = "Pretendard-Medium";
const BOLD = "Pretendard-Bold";

export const type = {
  hero: { fontFamily: BOLD, fontSize: 34, lineHeight: 42, letterSpacing: -0.6 },
  title: { fontFamily: BOLD, fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  section: { fontFamily: MEDIUM, fontSize: 16, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: REGULAR, fontSize: 15, lineHeight: 23, letterSpacing: -0.1 },
  amount: { fontFamily: BOLD, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  caption: { fontFamily: REGULAR, fontSize: 13, lineHeight: 19, letterSpacing: -0.1 },
} as const;

export const fonts = { REGULAR, MEDIUM, BOLD };
