export const color = {
  bg: "#FFFFFF",
  fill: "#F2F4F6", // 카드·입력 배경
  fillStrong: "#E5E8EB", // 눌림·구분
  text: "#191F28", // 본문
  textSub: "#4E5968", // 보조
  // 3차. #8B95A1 이었는데 흰 배경 대비 3.04, 회색 카드 위에서는 2.76 이라
  // WCAG AA(4.5)에 한참 못 미쳤다. 캡션은 장식이 아니라 금액 조건·목표
  // 안내처럼 읽어야 하는 글을 담고 있어서, 안 읽히면 기능이 사라진다.
  // 한 단계 어둡게 내려 흰 배경 5.03 / 회색면 4.56 으로 맞춘다.
  textMuted: "#66707D",
  // 입력창 테두리. 편집 가능한 영역의 경계라 구조다.
  // WCAG 1.4.11 의 3.0 기준을 넘는다(3.04).
  border: "#8B95A1",
  // 단 하나의 강조색. 이 밝은 쪽은 **면** 전용이다 — 채운 버튼, 달력의
  // 오늘 칸, 탭의 활성 표시. 글자로 쓰면 배경이 조금만 짙어져도 대비가
  // 무너지므로 글자는 항상 accentStrong 을 쓴다.
  accent: "#2B6CF6",
  accentSoft: "#E8F0FE", // 강조색 배경
  // 강조색이 **글자**로 쓰일 때는 전부 이 색이다.
  // (흰 배경 7.20 / 회색 카드 6.53 / accentSoft 6.28 / accentFill 5.42)
  accentStrong: "#1B4FBF",
  // 잃은 돈. #F04452 는 흰 배경 3.71, 연한 빨강 면 위 3.26 으로 둘 다
  // AA 미달이었다. 같은 계열에서 어둡게 내려 5.28 / 4.64 로 맞춘다.
  negative: "#CC2B3A",
  negativeSoft: "#FEECEE", // 잃은 돈 배경
  line: "#F2F4F6",          // 구분선. 장식이라 옅어도 된다
  // 이차 버튼의 면. 중립 회색(#F2F4F6)은 흰 배경 대비 1.10 이라 묻힌다.
  // 강조색 계열로 채우면 테두리 없이도 보이고, 그 위의 파란 글자가
  // 누를 수 있다는 신호를 같이 준다. 회색 테두리를 두르는 것보다
  // 정돈돼 보인다 — 테두리는 위계를 만들지 못하고 전부 같은 무게로 만든다.
  // 이차 버튼의 면이자 달력에서 확보한 날의 면. 전에는 확보한 날에
  // accentSecured(#CFDEFC) 라는 별도 토큰을 뒀는데 이 값과 색차가
  // ΔE 1.31 — 사람 눈이 구분하지 못하는 같은 색이었다. 하나로 합친다.
  accentFill: "#D2E0FC",
  accentPressed: "#2058CC", // primary 를 누른 동안. 눌렸다는 신호를 색으로도 준다
  accentFillPressed: "#BFD3FA",
  disabledFill: "#F2F4F6",  // 비활성은 투명도가 아니라 고유한 면으로 말한다

  // 어두운 면. 챌린지 선택·결제 화면에만 쓴다 — "여기는 돈을 거는 곳"을
  // 색을 하나 더 들이지 않고 말하기 위한 것이다. 새 계열이 아니라 본문
  // 색(#191F28)을 면으로 뒤집어 쓴다.
  ink: "#191F28",
  inkFill: "#242B36",       // 어두운 면 위의 카드
  // 어두운 면 위에서는 기존 강조색(#2B6CF6)이 대비 3.61 이라 본문으로
  // 안 읽힌다. 밝은 쪽으로 옮긴 변형이 필요하다.
  inkAccent: "#6BA1FF",     // 대비 6.44
  inkText: "#FFFFFF",       // 대비 16.56
  inkMuted: "#B0B8C1",      // 대비 8.26
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

// 본문 16, 캡션 14 가 하한이다. iOS HIG 는 본문 17pt 를 권하고 Material 은
// 14sp 를 최소·16sp 를 권장으로 둔다. 전에는 본문 15 / 캡션 13 이었는데,
// 캡션에 금액 조건 같은 꼭 읽어야 하는 문장이 들어가 있어서 눈이 좋지 않은
// 사람에게는 그 기능이 통째로 사라졌다. section 을 16→17 로 올린 것은
// 본문(16)과 1px 차이로는 위계가 보이지 않았기 때문이다.
export const type = {
  hero: { fontFamily: BOLD, fontSize: 34, lineHeight: 42, letterSpacing: -0.6 },
  title: { fontFamily: BOLD, fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  section: { fontFamily: MEDIUM, fontSize: 17, lineHeight: 25, letterSpacing: -0.2 },
  body: { fontFamily: REGULAR, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  amount: { fontFamily: BOLD, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  // 버튼 라벨. 16px 은 56pt 버튼 안에서 작아 보인다.
  button: { fontFamily: MEDIUM, fontSize: 17, lineHeight: 24, letterSpacing: -0.3 },
  caption: { fontFamily: REGULAR, fontSize: 14, lineHeight: 20, letterSpacing: -0.1 },
} as const;

export const fonts = { REGULAR, MEDIUM, BOLD };
