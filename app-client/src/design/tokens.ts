/**
 * 시험지와 통장에서 가져온 팔레트.
 *
 * 크림 바탕 + 세리프 + 테라코타, 근사흑 바탕 + 형광 악센트는 지금 생성형
 * 디자인의 기본값이라 피했다. 여기 색은 전부 이 제품의 소재에서 나온다 —
 * 시험지의 회녹색, 잉크, 도장의 인주, 스터디 플래너의 형광펜.
 */
export const color = {
  ground: "#E4E8E2",      // 시험지 회녹색
  paper: "#F6F8F4",       // 시트·행
  ink: "#16241E",         // 녹빛 도는 진한 잉크. 무채색 근사흑이 아니다
  inkMuted: "#5B6B63",
  stamp: "#A3241C",       // 인주 — 잃은 돈, 위험
  highlight: "#EBE04A",   // 형광펜 — 확보한 날의 표시
  line: "#C9D1C7",
} as const;

export const space = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64,
} as const;

export const radius = {
  // 요소마다 역할이 다르므로 반경도 다르다. 전부 같은 값으로 두면
  // 화면이 무엇이 중요한지 말하지 않게 된다.
  tick: 2, sheet: 6, button: 8, pill: 999,
} as const;

const SANS = "IBMPlexSansKR_400Regular";
const SANS_BOLD = "IBMPlexSansKR_700Bold";
const MONO = "IBMPlexMono_600SemiBold";

export const type = {
  // 금액과 원장 행만 고정폭이다. 장식이 아니라 자릿수를 세로로 맞추기 위해서다.
  display: { fontFamily: MONO, fontSize: 44, letterSpacing: -1.5 },
  amount: { fontFamily: MONO, fontSize: 17 },
  title: { fontFamily: SANS_BOLD, fontSize: 20 },
  body: { fontFamily: SANS, fontSize: 15, lineHeight: 23 },
  small: { fontFamily: SANS, fontSize: 13, lineHeight: 19 },
} as const;

export const fonts = { SANS, SANS_BOLD, MONO };
