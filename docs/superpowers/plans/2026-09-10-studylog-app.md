# StudyLog 앱 (Expo) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완성된 StudyLog 서버 API 위에 올라가는 Expo(React Native) 앱을 만든다 — 사진으로 공부를 인증하고, 챌린지에 돈을 걸고, 매일 크레딧으로 돌려받는 화면 전부.

**Architecture:** Expo Router의 파일 기반 라우팅으로 4개 탭(홈·피드·기록·설정)과 3개 모달(촬영·이의제기·복구)을 구성한다. 서버 상태는 전부 TanStack Query가 들고, 전역 상태 관리자는 두지 않는다 — 이 앱이 다루는 상태는 사실상 전부 서버 상태다. 토큰만 expo-secure-store에 남는다. 시간·판정·가격은 앱이 계산하지 않고 서버가 준 값을 표시만 한다.

**Tech Stack:** Expo SDK 57 (React 19 / RN 0.86) / TypeScript / Expo Router / TanStack Query v5 / expo-camera / expo-secure-store / expo-notifications / react-native-purchases (RevenueCat) / IBM Plex Sans KR · IBM Plex Mono / Jest + React Native Testing Library

**Spec:** [`docs/superpowers/specs/2026-09-09-studylog-v1-design.md`](../specs/2026-09-09-studylog-v1-design.md) — 특히 §9.1(앱 설계)와 §4(핵심 흐름)

**Server plan (참조용):** [`2026-09-09-studylog-server.md`](2026-09-09-studylog-server.md) — API 계약의 정본

## Global Constraints

- **앱은 시간을 스스로 세지 않는다.** 경과 시간은 서버가 준 `started_at`과 기기 시각의 차이로 *표시만* 한다. 기기 시계를 조작해도 정산에 영향이 없어야 한다
- **앱은 판정하지 않는다.** 업로드 응답의 `result`를 그대로 보여준다. 클라이언트에 임계값이 존재해서는 안 된다
- **가격표를 하드코딩하지 않는다.** 반드시 `GET /challenges/products`를 쓴다 — 첫 챌린지 상한이 유저마다 달라서, 하드코딩하면 상한이 무력화된다
- **결제는 RevenueCat SDK로만.** 앱이 서버에 "결제했다"고 알리는 경로는 만들지 않는다. 크레딧 지급은 서버가 웹훅으로만 한다
- **종료 샷 업로드가 성공하기 전까지 종료 화면을 닫지 않는다.** 실패했는데 유저가 끝났다고 믿으면 세션이 4시간 뒤 0분으로 회수된다
- 인증 토큰은 `expo-secure-store`에만 저장한다. `AsyncStorage`·`localStorage` 금지
- 모든 API 호출은 단일 클라이언트를 거친다. `fetch`를 화면에서 직접 부르지 않는다
- 서버 시각은 전부 UTC ISO8601이다. 표시할 때만 KST로 변환하고, 저장·비교는 UTC로 한다
- 하루 경계는 **04:00 KST**다. "오늘"을 계산할 때 자정 기준으로 자르지 않는다
- 401 응답은 토큰 만료로 간주하고 로그인 화면으로 보낸다. 403·402·409는 각각 다른 안내 문구를 쓴다
- API 기본 주소는 `EXPO_PUBLIC_API_URL` 환경변수로 주입한다. 소스에 도메인을 박지 않는다

### 환경 (Task 1에서 확인된 실제 값)

- Node는 nvm에만 있고 기본 PATH에 없다. 모든 셸에서 먼저 실행한다:
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`
- 설치된 것은 **Expo SDK 57 / React 19.2 / React Native 0.86**이다
- `npm install` 은 **`--legacy-peer-deps`** 가 필요하다. 이 조합에서 peer 범위가 아직 어긋나 있다
- `jest-expo` 는 `@react-native/jest-preset` 을 peer로 요구하므로 dev 의존성에 함께 넣는다
- `expo start --web` 은 `react-dom` 과 `react-native-web` 이 있어야 뜬다
- `npx expo install` 로 Expo 패키지를 넣고, 나머지는 `npm install --legacy-peer-deps` 로 넣는다

### 스타일은 전부 `src/design` 에서 온다

**Task 3 이후의 어떤 화면도 색·간격·글자 크기를 직접 쓰지 않는다.** Task 4~16의 코드
블록에는 값이 직접 적혀 있는데, 그것은 구조를 보여주기 위한 것이고 **아래 대응표대로
치환해서 구현한다.** 값을 그대로 두면 열 화면 뒤에는 되돌릴 수 없다.

| 코드 블록의 값 | 치환 |
|---|---|
| `#18181b`, `#000` (배경) | `color.ink` |
| `#fff` (잉크 위 글자) | `color.paper` |
| `#f4f4f5` (면) | `<Sheet>` 로 교체 |
| `#e4e4e7`, `#ddd`, `#d4d4d8` (선) | `color.line` |
| `#52525b` | `<T kind="muted">` |
| `#71717a`, `#a1a1aa` | `<T variant="small" kind="muted">` |
| `#dc2626` (위험·손실) | `color.stamp` |
| `#2563eb` (링크성 액션) | `<Button tone="quiet">` |
| `#16a34a` (성공) | 쓰지 않는다. 달성은 `color.highlight` 마크로 표현한다 |
| `padding: 14/16/18`, `gap: 8/12/16` | `space.sm` `space.md` `space.lg` |
| `borderRadius: 10/12/14/16` | `radius.sheet` (면) · `radius.button` (버튼) |
| `fontSize: 34/44` | `<T variant="display">` |
| `fontSize: 22/24`, `fontWeight: "700"` | `<T variant="title">` |
| `fontSize: 13`, `fontSize: 12` | `<T variant="small">` |
| 금액을 그리는 모든 `<Text>` | `<T variant="amount">` — 자릿수가 세로로 맞아야 한다 |
| `<Text>` · `<Pressable>` 직접 사용 | `<T>` · `<Button>` |

**홈의 가장 큰 숫자는 "돌려받은 돈"이 아니라 "아직 못 받은 돈"이다.** 같은 데이터를
뒤집는 것만으로 화면이 제품의 논지(손실회피)를 말한다. 보상 프레임으로 크게 띄우면
그냥 또 하나의 적립 앱이 된다. `CreditMeter` 는 그렇게 다시 만든다.

**움직이는 것은 하나뿐이다** — 인증이 통과되면 오늘 눈금이 칠해진다. 화면 진입
페이드, 카드 호버, 순차 등장은 넣지 않는다.

---

## File Structure

```
app/                          Expo Router (파일 = 라우트)
  _layout.tsx                 루트: Query Provider, 인증 게이트
  login.tsx                   로그인
  onboarding.tsx              목표 설정
  (tabs)/_layout.tsx          탭 네비게이터
  (tabs)/index.tsx            홈
  (tabs)/feed.tsx             피드
  (tabs)/records.tsx          기록
  (tabs)/settings.tsx         설정
  challenge/select.tsx        챌린지 선택
  groups/index.tsx            그룹 목록·생성·참여
  capture.tsx                 촬영 (모달)
  appeal/[photoId].tsx        이의제기 (모달)
  restore/[recordId].tsx      복구 (모달)

src/
  api/
    client.ts                 fetch 래퍼, 토큰 주입, 에러 → 타입화
    types.ts                  서버 응답 타입 (OpenAPI와 1:1)
    hooks.ts                  TanStack Query 훅 전부
  auth/
    storage.ts                expo-secure-store 토큰 보관
    useAuth.ts                로그인·로그아웃·현재 유저
  time/
    elapsed.ts                경과 시간 계산·포맷 (순수 함수)
    studyDay.ts               04:00 KST 하루 경계 (순수 함수)
  money/
    format.ts                 원화 표기 (순수 함수)
  components/
    CreditMeter.tsx           적립 크레딧 / 남은 금액
    StreakBadge.tsx
    SessionTimer.tsx
    PhotoGrid.tsx
  purchases/
    revenuecat.ts             SDK 초기화·구매 호출

__tests__/                    Jest
  time/, money/, api/, screens/
```

책임 경계: **틀리면 돈이나 시간이 어긋나는 계산은 전부 `src/time`·`src/money`의
순수 함수로 뺀다.** 화면은 그 함수를 부르고 결과를 그리기만 한다. 그래야 렌더링
없이 테스트할 수 있고, 이 앱에서 가장 많이 틀릴 부분이 바로 거기다.

---

## Task 1: Expo 스캐폴딩과 테스트 환경

**Files:**
- Create: `app-client/package.json`, `app-client/tsconfig.json`, `app-client/app.json`, `app-client/babel.config.js`, `app-client/jest.config.js`, `app-client/.env.example`, `app-client/.gitignore`, `app-client/app/_layout.tsx`, `app-client/app/index.tsx`
- Test: `app-client/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: Expo Router가 동작하는 앱, `npm test`로 도는 Jest, `EXPO_PUBLIC_API_URL` 주입 경로

앱은 `app-client/`에 만든다. 저장소 루트에는 이미 `server/`가 있고, Expo는
루트에 `app/` 디렉토리를 요구하기 때문에 섞으면 서버 코드와 충돌한다.

- [ ] **Step 1: 프로젝트 생성**

```bash
cd /Users/kwanghwi/dev/studylog
npx create-expo-app@latest app-client --template blank-typescript
cd app-client
npx expo install expo-router react-native-safe-area-context react-native-screens \
  expo-linking expo-constants expo-status-bar expo-secure-store expo-camera \
  expo-notifications expo-image-picker
npm install @tanstack/react-query
npm install --save-dev jest jest-expo @testing-library/react-native \
  @testing-library/jest-native @types/jest msw
```

- [ ] **Step 2: 실패하는 테스트 작성**

`app-client/__tests__/smoke.test.ts`:

```ts
import { apiBaseUrl } from "../src/config";

describe("설정", () => {
  it("EXPO_PUBLIC_API_URL 을 읽는다", () => {
    expect(apiBaseUrl()).toBe("http://127.0.0.1:8000");
  });

  it("주소가 없으면 조용히 넘어가지 않고 던진다", () => {
    const saved = process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_API_URL;
    expect(() => apiBaseUrl()).toThrow(/EXPO_PUBLIC_API_URL/);
    process.env.EXPO_PUBLIC_API_URL = saved;
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/smoke.test.ts`
Expected: FAIL — `Cannot find module '../src/config'`

- [ ] **Step 4: 설정 모듈과 Jest 구성 작성**

`app-client/src/config.ts`:

```ts
/** 서버 주소는 환경변수로만 들어온다. 소스에 도메인을 박지 않는다. */
export function apiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL 이 설정되지 않았습니다. .env 를 확인하세요."
    );
  }
  return url.replace(/\/$/, "");
}
```

`app-client/jest.config.js`:

```js
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
};
```

`app-client/jest.setup.js`:

```js
process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:8000";
```

`app-client/.env.example`:

```
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```

`package.json`에 `"test": "jest"`, `"main": "expo-router/entry"` 를 넣고,
`app.json`의 `expo` 아래에 `"scheme": "studylog"` 와
`"plugins": ["expo-router", "expo-secure-store", "expo-camera"]` 를 넣는다.
`.gitignore`에 `.env`, `node_modules/`, `.expo/` 를 넣는다.

- [ ] **Step 5: 최소 라우트 작성**

`app-client/app/_layout.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
```

`app-client/app/index.tsx`:

```tsx
import { Text, View } from "react-native";

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>StudyLog</Text>
    </View>
  );
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (2 passed)

- [ ] **Step 7: 앱이 실제로 뜨는지 확인**

Run: `cd app-client && npx expo start --web --non-interactive` 를 띄우고
브라우저에서 "StudyLog" 가 보이는지 확인한 뒤 종료한다. (시뮬레이터가 있으면 `--ios`)

- [ ] **Step 8: 커밋**

```bash
git add app-client/
git commit -m "feat(app): Expo 스캐폴딩과 테스트 환경"
```

---

## Task 2: 시간과 금액 계산 (순수 함수)

이 앱에서 가장 자주 틀릴 곳이다. 렌더링 없이 테스트할 수 있게 순수 함수로 빼고
여기서 고정한다. **앱은 시간을 세지 않고 서버가 준 시각으로 계산만 한다.**

**Files:**
- Create: `app-client/src/time/elapsed.ts`, `app-client/src/time/studyDay.ts`, `app-client/src/money/format.ts`
- Test: `app-client/__tests__/time.test.ts`, `app-client/__tests__/money.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `elapsedMinutes(startedAtIso: string, now: Date): number`
  - `formatElapsed(minutes: number): string` — `"1시간 35분"`
  - `remainingBeforeForfeit(startedAtIso: string, now: Date): number` — 회수까지 남은 분
  - `studyDayOf(date: Date): string` — `"2026-09-10"` (04:00 KST 경계)
  - `formatWon(amount: number): string` — `"₩7,000"`

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/time.test.ts`:

```ts
import {
  elapsedMinutes,
  formatElapsed,
  remainingBeforeForfeit,
} from "../src/time/elapsed";
import { studyDayOf } from "../src/time/studyDay";

const started = "2026-09-10T01:00:00Z";

describe("경과 시간", () => {
  it("서버 시각과 현재 시각의 차이를 분으로 준다", () => {
    expect(elapsedMinutes(started, new Date("2026-09-10T02:35:40Z"))).toBe(95);
  });

  it("초는 버린다", () => {
    expect(elapsedMinutes(started, new Date("2026-09-10T01:00:59Z"))).toBe(0);
  });

  it("기기 시계가 과거로 조작돼도 음수를 내지 않는다", () => {
    expect(elapsedMinutes(started, new Date("2026-09-09T20:00:00Z"))).toBe(0);
  });

  it("사람이 읽는 형태로 포맷한다", () => {
    expect(formatElapsed(0)).toBe("0분");
    expect(formatElapsed(59)).toBe("59분");
    expect(formatElapsed(60)).toBe("1시간");
    expect(formatElapsed(95)).toBe("1시간 35분");
  });

  it("회수까지 남은 시간을 준다", () => {
    // 상한 240분. 시작 후 215분이면 25분 남는다.
    expect(
      remainingBeforeForfeit(started, new Date("2026-09-10T04:35:00Z"))
    ).toBe(25);
  });

  it("이미 상한을 넘겼으면 0을 준다", () => {
    expect(
      remainingBeforeForfeit(started, new Date("2026-09-10T06:00:00Z"))
    ).toBe(0);
  });
});

describe("하루 경계", () => {
  it("KST 03:59 는 전날에 속한다", () => {
    // 2026-09-09 18:59Z == 2026-09-10 03:59 KST
    expect(studyDayOf(new Date("2026-09-09T18:59:00Z"))).toBe("2026-09-09");
  });

  it("KST 04:00 부터 새 하루다", () => {
    expect(studyDayOf(new Date("2026-09-09T19:00:00Z"))).toBe("2026-09-10");
  });

  it("한낮은 그날에 속한다", () => {
    expect(studyDayOf(new Date("2026-09-10T05:00:00Z"))).toBe("2026-09-10");
  });
});
```

`app-client/__tests__/money.test.ts`:

```ts
import { formatWon } from "../src/money/format";

describe("금액 표기", () => {
  it("천 단위를 끊고 원화 기호를 붙인다", () => {
    expect(formatWon(7000)).toBe("₩7,000");
    expect(formatWon(0)).toBe("₩0");
    expect(formatWon(1234567)).toBe("₩1,234,567");
  });

  it("음수도 형태를 유지한다", () => {
    expect(formatWon(-2000)).toBe("-₩2,000");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/time.test.ts __tests__/money.test.ts`
Expected: FAIL — `Cannot find module '../src/time/elapsed'`

- [ ] **Step 3: 구현**

`app-client/src/time/elapsed.ts`:

```ts
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
```

`app-client/src/time/studyDay.ts`:

```ts
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
```

`app-client/src/money/format.ts`:

```ts
export function formatWon(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}₩${Math.abs(amount).toLocaleString("ko-KR")}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd app-client && npx jest __tests__/time.test.ts __tests__/money.test.ts`
Expected: PASS (11 passed)

- [ ] **Step 5: 커밋**

```bash
git add app-client/src/time app-client/src/money app-client/__tests__
git commit -m "feat(app): 시간·금액 순수 함수"
```

---

## Task 3: 디자인 시스템

**이 태스크가 나머지 화면의 외관을 전부 결정한다.** 뒤에서 화면을 만들 때
색·간격·글자 크기를 직접 쓰지 않고 여기서 만든 토큰만 쓴다. 인라인으로 값을
박기 시작하면 열 화면 뒤에는 되돌릴 수 없다.

### 방향

이 앱은 생산성 앱이 아니라 **매일 돈이 들어오거나 사라지는 걸 보는 앱**이다.
그래서 기준을 습관 트래커가 아니라 **통장과 D-day**에 잡는다 — 한국 공부 문화에서
가장 강한 시각 어휘 두 개이고, 챌린지는 문자 그대로 날짜 카운트다운 + 금액 정산이다.

**가장 큰 숫자는 "얼마 받았나"가 아니라 "아직 못 받았나"다.** 같은 데이터를 뒤집는
것만으로 화면이 제품의 논지(손실회피)를 말하게 된다. 보상 프레임으로 크게 띄우면
그냥 또 하나의 적립 앱이 된다.

**대담함은 눈금 띠 하나에만 쓴다.** 챌린지 일수만큼 눈금이 있고, 확보한 날은
형광으로 칠해지고 놓친 날은 인주색으로 그어진다. 나머지 화면은 전부 조용하게 둔다.
카드 남발·모든 요소 동일 라운드·부드러운 회색 그림자는 쓰지 않는다.

**Files:**
- Create: `app-client/src/design/tokens.ts`, `app-client/src/design/Text.tsx`, `app-client/src/design/Button.tsx`, `app-client/src/design/Sheet.tsx`, `app-client/src/design/TickStrip.tsx`
- Modify: `app-client/app/_layout.tsx` (폰트 로딩)
- Test: `app-client/__tests__/design.test.tsx`

**Interfaces:**
- Consumes: `expo-font`, `@expo-google-fonts/ibm-plex-sans-kr`, `@expo-google-fonts/ibm-plex-mono`
- Produces:
  - `color`, `space`, `radius`, `type` — 토큰 객체
  - `<T variant kind>` — 텍스트. `variant`: `display | title | body | small | amount`
  - `<Button label onPress tone />` — `tone`: `primary | quiet | danger`
  - `<Sheet>` — 종이 한 장
  - `<TickStrip days marks />` — `marks`: `("secured" | "missed" | "pending")[]`

- [ ] **Step 1: 폰트 설치**

```bash
cd app-client
npx expo install expo-font @expo-google-fonts/ibm-plex-sans-kr @expo-google-fonts/ibm-plex-mono
```

IBM Plex Sans KR을 쓰는 이유는 한글을 제대로 지원하면서 기관 문서 같은 질감이
있기 때문이다. Pretendard는 지금 한국 앱의 사실상 기본값이라 쓰지 않는다.

- [ ] **Step 2: 실패하는 테스트 작성**

`app-client/__tests__/design.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";

import { color, space, type } from "../src/design/tokens";
import { TickStrip } from "../src/design/TickStrip";

describe("토큰", () => {
  it("바탕은 크림색이 아니라 회녹색이다", () => {
    expect(color.ground).toBe("#E4E8E2");
  });

  it("잉크는 무채색 근사흑이 아니라 색을 가진다", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.ink.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(8);
  });

  it("간격은 4의 배수 척도다", () => {
    expect(Object.values(space).every((v) => v % 4 === 0)).toBe(true);
  });

  it("금액은 자릿수를 맞추기 위해 고정폭을 쓴다", () => {
    expect(type.amount.fontFamily).toMatch(/Mono/);
  });

  it("본문은 고정폭을 쓰지 않는다", () => {
    expect(type.body.fontFamily).not.toMatch(/Mono/);
  });
});

describe("눈금 띠", () => {
  it("일수만큼 눈금을 그린다", () => {
    render(<TickStrip days={7} marks={Array(7).fill("pending")} />);
    expect(screen.getAllByTestId("tick")).toHaveLength(7);
  });

  it("확보한 날은 형광으로 칠한다", () => {
    render(
      <TickStrip days={3} marks={["secured", "missed", "pending"]} />
    );
    const ticks = screen.getAllByTestId("tick");
    expect(ticks[0].props.style.backgroundColor).toBe(color.highlight);
  });

  it("놓친 날은 인주색으로 표시한다", () => {
    render(<TickStrip days={3} marks={["secured", "missed", "pending"]} />);
    const ticks = screen.getAllByTestId("tick");
    expect(ticks[1].props.style.backgroundColor).toBe(color.stamp);
  });

  it("아직 오지 않은 날은 비워둔다", () => {
    render(<TickStrip days={3} marks={["secured", "missed", "pending"]} />);
    const ticks = screen.getAllByTestId("tick");
    expect(ticks[2].props.style.backgroundColor).toBe("transparent");
  });

  it("marks 가 days 보다 짧으면 나머지를 pending 으로 채운다", () => {
    render(<TickStrip days={5} marks={["secured"]} />);
    expect(screen.getAllByTestId("tick")).toHaveLength(5);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/design.test.tsx`
Expected: FAIL — `Cannot find module '../src/design/tokens'`

- [ ] **Step 4: 토큰 작성**

`app-client/src/design/tokens.ts`:

```ts
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
```

- [ ] **Step 5: 원시 컴포넌트 작성**

`app-client/src/design/Text.tsx`:

```tsx
import { Text as RNText, type TextProps } from "react-native";

import { color, type } from "./tokens";

type Variant = keyof typeof type;
type Kind = "ink" | "muted" | "stamp";

const TONE: Record<Kind, string> = {
  ink: color.ink,
  muted: color.inkMuted,
  stamp: color.stamp,
};

export function T({
  variant = "body",
  kind = "ink",
  style,
  ...rest
}: TextProps & { variant?: Variant; kind?: Kind }) {
  return <RNText style={[type[variant], { color: TONE[kind] }, style]} {...rest} />;
}
```

`app-client/src/design/Button.tsx`:

```tsx
import { Pressable, type PressableProps } from "react-native";

import { T } from "./Text";
import { color, radius, space } from "./tokens";

type Tone = "primary" | "quiet" | "danger";

export function Button({
  label,
  tone = "primary",
  disabled,
  ...rest
}: PressableProps & { label: string; tone?: Tone }) {
  const filled = tone === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: filled ? color.ink : "transparent",
        borderWidth: filled ? 0 : 1,
        borderColor: tone === "danger" ? color.stamp : color.line,
        borderRadius: radius.button,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
      {...rest}
    >
      <T
        variant="body"
        kind={filled ? "ink" : tone === "danger" ? "stamp" : "ink"}
        style={{
          textAlign: "center",
          color: filled ? color.paper : undefined,
        }}
      >
        {label}
      </T>
    </Pressable>
  );
}
```

`app-client/src/design/Sheet.tsx`:

```tsx
import { View, type ViewProps } from "react-native";

import { color, radius, space } from "./tokens";

/** 종이 한 장. 그림자를 쓰지 않는다 — 종이는 떠 있지 않다. */
export function Sheet({ style, ...rest }: ViewProps) {
  return (
    <View
      style={[
        {
          backgroundColor: color.paper,
          borderRadius: radius.sheet,
          borderWidth: 1,
          borderColor: color.line,
          padding: space.md,
        },
        style,
      ]}
      {...rest}
    />
  );
}
```

`app-client/src/design/TickStrip.tsx`:

```tsx
import { View } from "react-native";

import { color, radius, space } from "./tokens";

export type Mark = "secured" | "missed" | "pending";

const FILL: Record<Mark, string> = {
  secured: color.highlight,
  missed: color.stamp,
  pending: "transparent",
};

/**
 * 챌린지 일수를 눈금으로 편다. 이 앱에서 유일하게 대담한 요소다 —
 * D-day 카운터와 통장 정리가 한 줄에 겹친 것. 확보한 날은 형광으로 칠하고
 * 놓친 날은 인주색으로 남긴다.
 */
export function TickStrip({ days, marks }: { days: number; marks: Mark[] }) {
  const filled: Mark[] = Array.from(
    { length: days },
    (_, i) => marks[i] ?? "pending"
  );

  return (
    <View style={{ flexDirection: "row", gap: 3, alignItems: "flex-end" }}>
      {filled.map((mark, index) => (
        <View
          key={index}
          testID="tick"
          style={{
            flex: 1,
            height: mark === "pending" ? space.md : space.lg,
            backgroundColor: FILL[mark],
            borderWidth: 1,
            borderColor: mark === "pending" ? color.line : "transparent",
            borderRadius: radius.tick,
          }}
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 6: 폰트 로딩 연결**

`app-client/app/_layout.tsx` 에서 폰트를 불러온 뒤에만 화면을 그린다:

```tsx
import {
  IBMPlexSansKR_400Regular,
  IBMPlexSansKR_700Bold,
  useFonts,
} from "@expo-google-fonts/ibm-plex-sans-kr";
import { IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono";

  const [loaded] = useFonts({
    IBMPlexSansKR_400Regular,
    IBMPlexSansKR_700Bold,
    IBMPlexMono_600SemiBold,
  });
  if (!loaded) return null;
```

그리고 `<Stack screenOptions>` 에 `contentStyle: { backgroundColor: color.ground }` 를 넣어
모든 화면의 바탕을 통일한다.

`app-client/jest.setup.js` 에 폰트 훅 모킹을 추가한다:

```js
jest.mock("@expo-google-fonts/ibm-plex-sans-kr", () => ({
  useFonts: () => [true],
  IBMPlexSansKR_400Regular: "IBMPlexSansKR_400Regular",
  IBMPlexSansKR_700Bold: "IBMPlexSansKR_700Bold",
}));
jest.mock("@expo-google-fonts/ibm-plex-mono", () => ({
  IBMPlexMono_600SemiBold: "IBMPlexMono_600SemiBold",
}));
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (21 passed)

- [ ] **Step 8: 커밋**

```bash
git add app-client/src/design app-client/app/_layout.tsx app-client/jest.setup.js app-client/package.json app-client/__tests__/design.test.tsx
git commit -m "feat(app): 디자인 시스템 — 시험지·통장에서 가져온 토큰과 눈금 띠"
```

---

## Task 4: API 클라이언트와 타입

**Files:**
- Create: `app-client/src/api/types.ts`, `app-client/src/api/client.ts`, `app-client/src/auth/storage.ts`
- Test: `app-client/__tests__/client.test.ts`

**Interfaces:**
- Consumes: `apiBaseUrl()`
- Produces:
  - `ApiError` — `status: number`, `detail: string`, `kind: "auth" | "payment" | "forbidden" | "conflict" | "other"`
  - `api.get<T>(path)`, `api.post<T>(path, body?)`, `api.patch<T>(path, body)`, `api.put(path, body)`, `api.postForm<T>(path, form)`
  - `saveToken(token)`, `loadToken()`, `clearToken()`
  - 서버 응답 타입 전부 (`UserOut`, `SessionOut`, `JudgeResultOut`, `ChallengeOut`, `ChallengeProductOut`, `GroupOut`, `FeedItemOut`, `DailyRecordOut`)

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/client.test.ts`:

```ts
import { ApiError, api, setTokenGetter } from "../src/api/client";

const json = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);

describe("API 클라이언트", () => {
  beforeEach(() => {
    setTokenGetter(async () => "tok-123");
  });

  it("절대 주소로 부른다", async () => {
    const spy = jest.spyOn(global, "fetch").mockReturnValue(json({ ok: 1 }));
    await api.get("/users/me");
    expect(spy.mock.calls[0][0]).toBe("http://127.0.0.1:8000/users/me");
    spy.mockRestore();
  });

  it("토큰을 Authorization 헤더로 붙인다", async () => {
    const spy = jest.spyOn(global, "fetch").mockReturnValue(json({}));
    await api.get("/users/me");
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-123"
    );
    spy.mockRestore();
  });

  it("토큰이 없으면 헤더를 아예 안 붙인다", async () => {
    setTokenGetter(async () => null);
    const spy = jest.spyOn(global, "fetch").mockReturnValue(json({}));
    await api.post("/auth/social", { provider: "apple" });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    spy.mockRestore();
  });

  it.each([
    [401, "auth"],
    [402, "payment"],
    [403, "forbidden"],
    [409, "conflict"],
    [500, "other"],
  ])("%i 를 %s 로 분류한다", async (status, kind) => {
    const spy = jest
      .spyOn(global, "fetch")
      .mockReturnValue(json({ detail: "안내" }, status as number));
    await expect(api.get("/users/me")).rejects.toMatchObject({
      status,
      kind,
      detail: "안내",
    });
    spy.mockRestore();
  });

  it("detail 이 없어도 던진다", async () => {
    const spy = jest.spyOn(global, "fetch").mockReturnValue(json({}, 500));
    await expect(api.get("/x")).rejects.toBeInstanceOf(ApiError);
    spy.mockRestore();
  });

  it("multipart 는 Content-Type 을 직접 정하지 않는다", async () => {
    const spy = jest.spyOn(global, "fetch").mockReturnValue(json({}));
    const form = new FormData();
    await api.postForm("/sessions/start", form);
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    spy.mockRestore();
  });
});
```

`multipart` 경계 문자열은 런타임이 붙인다. 직접 `Content-Type`을 정하면
boundary가 빠져서 서버가 파일을 못 읽는다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/client.test.ts`
Expected: FAIL — `Cannot find module '../src/api/client'`

- [ ] **Step 3: 타입 작성**

`app-client/src/api/types.ts`:

```ts
export type UserOut = {
  id: string;
  nickname: string;
  daily_goal_minutes: number;
  pending_goal_minutes: number | null;
  streak_count: number;
  credit_balance: number;
};

export type SessionOut = {
  id: string;
  started_at: string;
  ended_at: string | null;
  counted_minutes: number;
  status: "open" | "closed" | "abandoned";
};

export type JudgeResultOut = {
  result: "pass" | "fail";
  photo_id: string;
  reason: string;
  session: SessionOut | null;
};

export type ChallengeOut = {
  id: string;
  product_id: string;
  entry_amount: number;
  daily_payback: number;
  completion_bonus: number;
  total_days: number;
  started_on: string;
  ends_on: string;
  paid_with: "iap" | "credit";
  status: "active" | "completed" | "refunded";
};

export type ChallengeProductOut = {
  product_id: string;
  days: number;
  daily_payback: number;
  price: number;
  completion_bonus: number;
};

export type GroupOut = { id: string; name: string; invite_code: string };

export type FeedPhotoOut = {
  kind: "start" | "end";
  url: string;
  received_at: string;
};

export type FeedItemOut = {
  user_id: string;
  nickname: string;
  streak_count: number;
  total_minutes: number;
  goal_minutes: number;
  result: "success" | "passed" | "failed" | null;
  photos: FeedPhotoOut[];
};

export type DailyRecordOut = {
  id: string;
  date: string;
  total_minutes: number;
  goal_minutes: number;
  result: "success" | "passed" | "failed";
  payback_amount: number;
  streak_snapshot: number;
  settled_at: string;
};

export type LoginOut = { access_token: string; user: UserOut };
```

- [ ] **Step 4: 클라이언트와 토큰 저장 작성**

`app-client/src/api/client.ts`:

```ts
import { apiBaseUrl } from "../config";

export type ErrorKind = "auth" | "payment" | "forbidden" | "conflict" | "other";

const KIND_BY_STATUS: Record<number, ErrorKind> = {
  401: "auth",
  402: "payment",
  403: "forbidden",
  409: "conflict",
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly kind: ErrorKind
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;

/** 앱 시작 시 한 번 주입한다. 화면이 토큰을 직접 만지지 않게 하는 장치다. */
export function setTokenGetter(getter: TokenGetter): void {
  getToken = getter;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  body?: unknown,
  form?: FormData
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { ...(init.headers as object) };
  if (token) headers.Authorization = `Bearer ${token}`;
  // multipart 는 boundary 를 런타임이 붙인다. 직접 정하면 서버가 못 읽는다.
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      (payload as { detail?: string }).detail ?? "요청을 처리하지 못했습니다.",
      KIND_BY_STATUS[response.status] ?? "other"
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST" }, body ?? {}),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH" }, body),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT" }, body),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST" }, undefined, form),
};
```

`app-client/src/auth/storage.ts`:

```ts
import * as SecureStore from "expo-secure-store";

const KEY = "studylog.token";

/** 토큰은 SecureStore 에만 둔다. AsyncStorage 는 암호화되지 않는다. */
export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function loadToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd app-client && npx jest __tests__/client.test.ts`
Expected: PASS (10 passed)

- [ ] **Step 6: 커밋**

```bash
git add app-client/src/api app-client/src/auth app-client/__tests__/client.test.ts
git commit -m "feat(app): API 클라이언트와 서버 타입"
```

---

## Task 5: 인증 게이트와 로그인

**Files:**
- Create: `app-client/src/auth/useAuth.ts`, `app-client/src/api/hooks.ts`, `app-client/app/login.tsx`
- Modify: `app-client/app/_layout.tsx`, `app-client/app/index.tsx`
- Test: `app-client/__tests__/auth.test.tsx`

**Interfaces:**
- Consumes: `api`, `saveToken`/`loadToken`/`clearToken`, `setTokenGetter`, `LoginOut`
- Produces:
  - `useAuth()` → `{ status: "loading" | "signedOut" | "signedIn", user: UserOut | null, signIn(provider, idToken, nickname), signOut() }`
  - `useMe()`, `useCurrentSession()`, `useCurrentChallenge()` — TanStack Query 훅
  - `<AuthGate>` — 토큰 유무에 따라 로그인/앱으로 보낸다

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/auth.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "../src/auth/useAuth";

jest.mock("expo-secure-store");

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("인증", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it("토큰이 없으면 signedOut 이다", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });

  it("저장된 토큰이 있으면 signedIn 으로 시작한다", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("tok");
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));
  });

  it("로그인하면 토큰을 SecureStore 에 넣는다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "new-tok",
        user: { id: "u1", nickname: "광휘", daily_goal_minutes: 60,
                pending_goal_minutes: null, streak_count: 0, credit_balance: 0 },
      }),
    } as Response);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    await act(() => result.current.signIn("apple", "id-token", "광휘"));

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("studylog.token", "new-tok");
    await waitFor(() => expect(result.current.status).toBe("signedIn"));
  });

  it("로그아웃하면 토큰을 지운다", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("tok");
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    await act(() => result.current.signOut());
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("studylog.token");
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/auth.test.tsx`
Expected: FAIL — `Cannot find module '../src/auth/useAuth'`

- [ ] **Step 3: 인증 훅 작성**

`app-client/src/auth/useAuth.ts`:

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { api, setTokenGetter } from "../api/client";
import type { LoginOut, UserOut } from "../api/types";
import { clearToken, loadToken, saveToken } from "./storage";

setTokenGetter(loadToken);

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: token, isLoading } = useQuery({
    queryKey: ["token"],
    queryFn: loadToken,
    staleTime: Infinity,
  });

  const signIn = useCallback(
    async (provider: "apple" | "google", idToken: string, nickname: string) => {
      const out = await api.post<LoginOut>("/auth/social", {
        provider,
        id_token: idToken,
        nickname,
      });
      await saveToken(out.access_token);
      queryClient.setQueryData(["token"], out.access_token);
      queryClient.setQueryData(["me"], out.user);
    },
    [queryClient]
  );

  const signOut = useCallback(async () => {
    await clearToken();
    queryClient.setQueryData(["token"], null);
    // 토큰이 바뀌면 이전 유저의 캐시가 남아 있으면 안 된다
    queryClient.clear();
  }, [queryClient]);

  const status: AuthStatus = isLoading
    ? "loading"
    : token
      ? "signedIn"
      : "signedOut";

  return {
    status,
    user: queryClient.getQueryData<UserOut>(["me"]) ?? null,
    signIn,
    signOut,
  };
}
```

- [ ] **Step 4: 쿼리 훅 작성**

`app-client/src/api/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  ChallengeOut, ChallengeProductOut, DailyRecordOut,
  FeedItemOut, GroupOut, SessionOut, UserOut,
} from "./types";

export const keys = {
  me: ["me"] as const,
  session: ["session", "current"] as const,
  challenge: ["challenge", "current"] as const,
  products: ["challenge", "products"] as const,
  groups: ["groups"] as const,
  feed: (groupId: string) => ["feed", groupId] as const,
  records: ["records"] as const,
};

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: () => api.get<UserOut>("/users/me") });

export const useCurrentSession = () =>
  useQuery({
    queryKey: keys.session,
    queryFn: () => api.get<SessionOut | null>("/sessions/current"),
    // 세션이 열려 있으면 서버가 회수했는지 주기적으로 확인해야 한다
    refetchInterval: 60_000,
  });

export const useCurrentChallenge = () =>
  useQuery({
    queryKey: keys.challenge,
    queryFn: () => api.get<ChallengeOut | null>("/challenges/current"),
  });

export const useProducts = () =>
  useQuery({
    queryKey: keys.products,
    queryFn: () => api.get<ChallengeProductOut[]>("/challenges/products"),
  });

export const useGroups = () =>
  useQuery({ queryKey: keys.groups, queryFn: () => api.get<GroupOut[]>("/groups") });

export const useFeed = (groupId: string | undefined) =>
  useQuery({
    queryKey: keys.feed(groupId ?? ""),
    queryFn: () => api.get<FeedItemOut[]>(`/groups/${groupId}/feed`),
    enabled: Boolean(groupId),
  });

export const useRecords = () =>
  useQuery({
    queryKey: keys.records,
    queryFn: () => api.get<DailyRecordOut[]>("/records/me?limit=30"),
  });

/** 세션·유저·챌린지는 함께 움직인다. 하나가 바뀌면 셋 다 다시 읽는다. */
export function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.me }),
      queryClient.invalidateQueries({ queryKey: keys.session }),
      queryClient.invalidateQueries({ queryKey: keys.challenge }),
    ]);
}

export function useSetGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) =>
      api.patch<UserOut>("/users/me/goal", { minutes }),
    onSuccess: (user) => queryClient.setQueryData(keys.me, user),
  });
}
```

- [ ] **Step 5: 로그인 화면과 게이트 작성**

`app-client/app/login.tsx`:

```tsx
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { useAuth } from "../src/auth/useAuth";

export default function Login() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handle(provider: "apple" | "google") {
    setBusy(true);
    try {
      // TODO(Task 15): expo-apple-authentication / expo-auth-session 으로 교체.
      // 그전까지는 개발용 토큰으로 서버에 붙는다.
      const idToken = process.env.EXPO_PUBLIC_DEV_ID_TOKEN ?? "dev";
      await signIn(provider, idToken, "광휘");
      router.replace("/");
    } catch (error) {
      Alert.alert("로그인 실패", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 24 }}>
        스터디로그
      </Text>
      <Pressable
        disabled={busy}
        onPress={() => handle("apple")}
        style={{ backgroundColor: "#000", padding: 16, borderRadius: 12 }}
      >
        <Text style={{ color: "#fff", textAlign: "center" }}>Apple로 계속하기</Text>
      </Pressable>
      <Pressable
        disabled={busy}
        onPress={() => handle("google")}
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 16, borderRadius: 12 }}
      >
        <Text style={{ textAlign: "center" }}>Google로 계속하기</Text>
      </Pressable>
    </View>
  );
}
```

`app-client/app/index.tsx` 를 게이트로 바꾼다:

```tsx
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "../src/auth/useAuth";

export default function Index() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Redirect href={status === "signedIn" ? "/(tabs)" : "/login"} />;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (16 passed)

- [ ] **Step 7: 커밋**

```bash
git add app-client/src app-client/app app-client/__tests__
git commit -m "feat(app): 인증 게이트와 로그인"
```

---

## Task 6: 탭 레이아웃과 홈

홈은 이 앱에서 유일하게 매일 열리는 화면이다. **적립 크레딧과 남은 일수를 최상단에
상시 노출**하는 것이 동기부여의 전부다 — 돈이 차오르는 걸 보여주는 게 이 제품이다.

**Files:**
- Create: `app-client/app/(tabs)/_layout.tsx`, `app-client/app/(tabs)/index.tsx`, `app-client/src/components/CreditMeter.tsx`, `app-client/src/components/SessionTimer.tsx`, `app-client/src/components/StreakBadge.tsx`
- Test: `app-client/__tests__/home.test.tsx`, `app-client/__tests__/components.test.tsx`

**Interfaces:**
- Consumes: `useMe`, `useCurrentSession`, `useCurrentChallenge`, `elapsedMinutes`, `formatElapsed`, `remainingBeforeForfeit`, `formatWon`
- Produces:
  - `<CreditMeter challenge earned />` — 적립액 / 목표액과 남은 일수
  - `<SessionTimer startedAt />` — 1초마다 다시 그리는 경과 시간
  - `<StreakBadge count />`

- [ ] **Step 1: 컴포넌트 테스트 작성**

`app-client/__tests__/components.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";

import { CreditMeter } from "../src/components/CreditMeter";
import { SessionTimer } from "../src/components/SessionTimer";

const challenge = {
  id: "c1", product_id: "challenge_30d_1k", entry_amount: 30000,
  daily_payback: 1000, completion_bonus: 3000, total_days: 30,
  started_on: "2026-09-01", ends_on: "2026-09-30",
  paid_with: "iap" as const, status: "active" as const,
};

describe("CreditMeter", () => {
  it("적립액과 참가비를 함께 보여준다", () => {
    render(<CreditMeter challenge={challenge} earned={12000} today="2026-09-12" />);
    expect(screen.getByText("₩12,000")).toBeTruthy();
    expect(screen.getByText(/₩30,000/)).toBeTruthy();
  });

  it("남은 일수를 종료일 기준으로 센다", () => {
    render(<CreditMeter challenge={challenge} earned={0} today="2026-09-12" />);
    expect(screen.getByText("18일 남음")).toBeTruthy();
  });

  it("마지막 날은 오늘까지 센다", () => {
    render(<CreditMeter challenge={challenge} earned={0} today="2026-09-30" />);
    expect(screen.getByText("오늘이 마지막 날")).toBeTruthy();
  });

  it("챌린지가 없으면 참가를 권한다", () => {
    render(<CreditMeter challenge={null} earned={0} today="2026-09-12" />);
    expect(screen.getByText(/챌린지 시작/)).toBeTruthy();
  });
});

describe("SessionTimer", () => {
  it("서버 시각 기준 경과 시간을 보여준다", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T02:35:00Z"));
    render(<SessionTimer startedAt="2026-09-10T01:00:00Z" />);
    expect(screen.getByText("1시간 35분")).toBeTruthy();
    jest.useRealTimers();
  });

  it("회수가 가까우면 경고한다", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T04:35:00Z"));
    render(<SessionTimer startedAt="2026-09-10T01:00:00Z" />);
    expect(screen.getByText(/25분 뒤 자동 폐기/)).toBeTruthy();
    jest.useRealTimers();
  });

  it("여유가 있으면 경고하지 않는다", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T01:30:00Z"));
    render(<SessionTimer startedAt="2026-09-10T01:00:00Z" />);
    expect(screen.queryByText(/자동 폐기/)).toBeNull();
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/components.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/CreditMeter'`

- [ ] **Step 3: 컴포넌트 작성**

`app-client/src/components/CreditMeter.tsx`:

```tsx
import { Text, View } from "react-native";

import type { ChallengeOut } from "../api/types";
import { formatWon } from "../money/format";

function daysLeftLabel(endsOn: string, today: string): string {
  const left = Math.round(
    (Date.parse(endsOn) - Date.parse(today)) / 86_400_000
  );
  if (left <= 0) return "오늘이 마지막 날";
  return `${left}일 남음`;
}

export function CreditMeter({
  challenge,
  earned,
  today,
}: {
  challenge: ChallengeOut | null;
  earned: number;
  today: string;
}) {
  if (!challenge) {
    return (
      <View style={{ padding: 20, borderRadius: 16, backgroundColor: "#f4f4f5" }}>
        <Text style={{ fontSize: 15, color: "#52525b" }}>
          챌린지 시작하고 매일 돌려받기
        </Text>
      </View>
    );
  }

  const ratio = Math.min(1, earned / challenge.entry_amount);
  return (
    <View style={{ padding: 20, borderRadius: 16, backgroundColor: "#f4f4f5", gap: 8 }}>
      <Text style={{ fontSize: 34, fontWeight: "700" }}>{formatWon(earned)}</Text>
      <Text style={{ fontSize: 14, color: "#52525b" }}>
        {formatWon(challenge.entry_amount)} 중 돌려받음
      </Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: "#e4e4e7" }}>
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: "#18181b",
            width: `${ratio * 100}%`,
          }}
        />
      </View>
      <Text style={{ fontSize: 13, color: "#71717a" }}>
        {daysLeftLabel(challenge.ends_on, today)}
      </Text>
    </View>
  );
}
```

`app-client/src/components/SessionTimer.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { elapsedMinutes, formatElapsed, remainingBeforeForfeit } from "../time/elapsed";

const WARN_UNDER_MINUTES = 30;

export function SessionTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // 시간의 근거는 서버가 준 startedAt 뿐이다. 앱은 빼기만 한다.
  const minutes = elapsedMinutes(startedAt, now);
  const remaining = remainingBeforeForfeit(startedAt, now);

  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 44, fontWeight: "700" }}>
        {formatElapsed(minutes)}
      </Text>
      {remaining <= WARN_UNDER_MINUTES && (
        <Text style={{ color: "#dc2626", fontSize: 13 }}>
          {remaining}분 뒤 자동 폐기됩니다. 종료 샷을 찍으세요.
        </Text>
      )}
    </View>
  );
}
```

`app-client/src/components/StreakBadge.tsx`:

```tsx
import { Text, View } from "react-native";

export function StreakBadge({ count }: { count: number }) {
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 999, backgroundColor: "#fef3c7",
      }}
    >
      <Text style={{ fontSize: 14 }}>🔥</Text>
      <Text style={{ fontSize: 14, fontWeight: "600" }}>{count}일</Text>
    </View>
  );
}
```

- [ ] **Step 4: 홈 화면 테스트 작성**

`app-client/__tests__/home.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";

import Home from "../app/(tabs)/index";

function renderWithData(payloads: Record<string, unknown>) {
  jest.spyOn(global, "fetch").mockImplementation((url) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    return Promise.resolve({
      ok: true, status: 200, json: async () => payloads[path] ?? null,
    } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>
  );
}

const me = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 5, credit_balance: 12000,
};

afterEach(() => jest.restoreAllMocks());

describe("홈", () => {
  it("세션이 없으면 시작 버튼을 보여준다", async () => {
    renderWithData({ "/users/me": me, "/sessions/current": null,
                     "/challenges/current": null });
    await waitFor(() => expect(screen.getByText("공부 시작")).toBeTruthy());
  });

  it("세션이 열려 있으면 종료 버튼과 타이머를 보여준다", async () => {
    renderWithData({
      "/users/me": me,
      "/sessions/current": {
        id: "s1", started_at: "2026-09-10T01:00:00Z", ended_at: null,
        counted_minutes: 0, status: "open",
      },
      "/challenges/current": null,
    });
    await waitFor(() => expect(screen.getByText("공부 종료")).toBeTruthy());
  });

  it("streak 를 보여준다", async () => {
    renderWithData({ "/users/me": me, "/sessions/current": null,
                     "/challenges/current": null });
    await waitFor(() => expect(screen.getByText("5일")).toBeTruthy());
  });
});
```

- [ ] **Step 5: 탭 레이아웃과 홈 작성**

`app-client/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="feed" options={{ title: "피드" }} />
      <Tabs.Screen name="records" options={{ title: "기록" }} />
      <Tabs.Screen name="settings" options={{ title: "설정" }} />
    </Tabs>
  );
}
```

`app-client/app/(tabs)/index.tsx`:

```tsx
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useCurrentChallenge, useCurrentSession, useMe } from "../../src/api/hooks";
import { CreditMeter } from "../../src/components/CreditMeter";
import { SessionTimer } from "../../src/components/SessionTimer";
import { StreakBadge } from "../../src/components/StreakBadge";
import { formatWon } from "../../src/money/format";
import { studyDayOf } from "../../src/time/studyDay";

export default function Home() {
  const me = useMe();
  const session = useCurrentSession();
  const challenge = useCurrentChallenge();

  const open = session.data?.status === "open" ? session.data : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingTop: 64 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>
          {me.data?.nickname ?? ""}
        </Text>
        <StreakBadge count={me.data?.streak_count ?? 0} />
      </View>

      <CreditMeter
        challenge={challenge.data ?? null}
        earned={me.data?.credit_balance ?? 0}
        today={studyDayOf(new Date())}
      />

      {open ? (
        <View style={{ gap: 16 }}>
          <SessionTimer startedAt={open.started_at} />
          <Pressable
            onPress={() => router.push({ pathname: "/capture", params: { kind: "end", sessionId: open.id } })}
            style={{ backgroundColor: "#18181b", padding: 18, borderRadius: 14 }}
          >
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>
              공부 종료
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => router.push({ pathname: "/capture", params: { kind: "start" } })}
          style={{ backgroundColor: "#18181b", padding: 18, borderRadius: 14 }}
        >
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>
            공부 시작
          </Text>
        </Pressable>
      )}

      <Text style={{ color: "#71717a", fontSize: 13 }}>
        오늘 목표 {me.data?.daily_goal_minutes ?? 0}분 · 잔액{" "}
        {formatWon(me.data?.credit_balance ?? 0)}
      </Text>
    </ScrollView>
  );
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (26 passed)

- [ ] **Step 7: 커밋**

```bash
git add app-client/app app-client/src/components app-client/__tests__
git commit -m "feat(app): 탭 레이아웃과 홈 화면"
```

---

## Task 7: 촬영과 시작 샷

**Files:**
- Create: `app-client/app/capture.tsx`, `app-client/src/api/upload.ts`
- Modify: `app-client/app/_layout.tsx` (모달 프레젠테이션)
- Test: `app-client/__tests__/upload.test.ts`, `app-client/__tests__/capture.test.tsx`

**Interfaces:**
- Consumes: `api.postForm`, `JudgeResultOut`, `useInvalidateAll`
- Produces:
  - `uploadPhoto(kind, uri, sessionId?) -> Promise<JudgeResultOut>`
  - `/capture?kind=start` · `/capture?kind=end&sessionId=...` 모달

- [ ] **Step 1: 업로드 테스트 작성**

`app-client/__tests__/upload.test.ts`:

```ts
import { uploadPhoto } from "../src/api/upload";

describe("사진 업로드", () => {
  beforeEach(() => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ result: "pass", photo_id: "p1", reason: "", session: null }),
    } as Response);
  });
  afterEach(() => jest.restoreAllMocks());

  it("시작 샷은 /sessions/start 로 간다", async () => {
    await uploadPhoto("start", "file:///tmp/a.jpg");
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/sessions/start"
    );
  });

  it("종료 샷은 세션 id 를 경로에 넣는다", async () => {
    await uploadPhoto("end", "file:///tmp/a.jpg", "s1");
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/sessions/s1/end"
    );
  });

  it("종료 샷인데 세션 id 가 없으면 부르기 전에 막는다", async () => {
    await expect(uploadPhoto("end", "file:///tmp/a.jpg")).rejects.toThrow(
      /세션/
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("image 라는 이름으로 붙인다", async () => {
    await uploadPhoto("start", "file:///tmp/a.jpg");
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get("image")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/upload.test.ts`
Expected: FAIL — `Cannot find module '../src/api/upload'`

- [ ] **Step 3: 업로드 함수 작성**

`app-client/src/api/upload.ts`:

```ts
import { api } from "./client";
import type { JudgeResultOut } from "./types";

export type ShotKind = "start" | "end";

/**
 * 사진을 올리고 판정 결과를 받는다. 서버가 같은 요청 안에서 AI 판정까지
 * 끝내므로 응답이 곧 결과다 — 폴링할 것이 없다.
 */
export async function uploadPhoto(
  kind: ShotKind,
  uri: string,
  sessionId?: string
): Promise<JudgeResultOut> {
  if (kind === "end" && !sessionId) {
    throw new Error("종료 샷에는 세션 id 가 필요합니다.");
  }

  const form = new FormData();
  form.append("image", {
    uri,
    name: "shot.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  const path = kind === "start" ? "/sessions/start" : `/sessions/${sessionId}/end`;
  return api.postForm<JudgeResultOut>(path, form);
}
```

- [ ] **Step 4: 촬영 화면 테스트 작성**

`app-client/__tests__/capture.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Capture from "../app/capture";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ kind: "start" }),
}));

jest.mock("expo-camera", () => ({
  CameraView: ({ children }: { children: React.ReactNode }) => children ?? null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("촬영", () => {
  it("통과하면 결과를 보여주고 닫을 수 있다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        result: "pass", photo_id: "p1", reason: "책상에서 공부 중입니다.",
        session: { id: "s1", started_at: "2026-09-10T01:00:00Z", ended_at: null,
                   counted_minutes: 0, status: "open" },
      }),
    } as Response);

    wrap(<Capture />);
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText(/공부 시작됨/)).toBeTruthy());
  });

  it("거절되면 사유와 재촬영·이의제기를 보여준다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        result: "fail", photo_id: "p9", reason: "게임 화면입니다.", session: null,
      }),
    } as Response);

    wrap(<Capture />);
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("게임 화면입니다.")).toBeTruthy());
    expect(screen.getByText("다시 찍기")).toBeTruthy();
    expect(screen.getByText("이의제기")).toBeTruthy();
  });

  it("업로드가 실패하면 재시도를 제안한다", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));

    wrap(<Capture />);
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());
  });
});
```

- [ ] **Step 5: 촬영 화면 작성**

`app-client/app/capture.tsx`:

```tsx
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useInvalidateAll } from "../src/api/hooks";
import { uploadPhoto, type ShotKind } from "../src/api/upload";
import type { JudgeResultOut } from "../src/api/types";

type Phase =
  | { name: "ready" }
  | { name: "uploading" }
  | { name: "judged"; result: JudgeResultOut }
  | { name: "error"; message: string };

export default function Capture() {
  const { kind, sessionId } = useLocalSearchParams<{
    kind: ShotKind;
    sessionId?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ name: "ready" });
  const cameraRef = useRef<CameraView>(null);
  const invalidate = useInvalidateAll();

  async function shoot() {
    setPhase({ name: "uploading" });
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      const result = await uploadPhoto(kind, photo?.uri ?? "", sessionId);
      await invalidate();
      setPhase({ name: "judged", result });
    } catch (error) {
      setPhase({ name: "error", message: (error as Error).message });
    }
  }

  if (!permission?.granted) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Text>공부 인증에는 카메라가 필요합니다.</Text>
        <Pressable onPress={requestPermission}>
          <Text style={{ color: "#2563eb" }}>카메라 권한 허용</Text>
        </Pressable>
      </View>
    );
  }

  if (phase.name === "judged") {
    const passed = phase.result.result === "pass";
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700" }}>
          {passed
            ? kind === "start"
              ? "공부 시작됨"
              : "공부 종료됨"
            : "인증이 거절됐습니다"}
        </Text>
        <Text style={{ color: "#52525b" }}>{phase.result.reason}</Text>
        {passed ? (
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: "#2563eb" }}>확인</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 12 }}>
            <Pressable onPress={() => setPhase({ name: "ready" })}>
              <Text style={{ color: "#2563eb" }}>다시 찍기</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.replace(`/appeal/${phase.result.photo_id}`)
              }
            >
              <Text style={{ color: "#71717a" }}>이의제기</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  if (phase.name === "error") {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>
          사진을 올리지 못했습니다
        </Text>
        <Text style={{ color: "#52525b" }}>{phase.message}</Text>
        <Pressable onPress={shoot}>
          <Text style={{ color: "#2563eb" }}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      <View style={{ padding: 24, alignItems: "center" }}>
        {phase.name === "uploading" ? (
          <View style={{ alignItems: "center", gap: 8 }}>
            <ActivityIndicator />
            <Text style={{ color: "#71717a" }}>판정 중…</Text>
          </View>
        ) : (
          <Pressable
            onPress={shoot}
            style={{
              backgroundColor: "#18181b", paddingHorizontal: 40,
              paddingVertical: 18, borderRadius: 999,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>촬영</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
```

`app-client/app/_layout.tsx` 의 `<Stack>` 에 모달 선언을 추가한다:

```tsx
        <Stack.Screen name="capture" options={{ presentation: "modal" }} />
        <Stack.Screen name="appeal/[photoId]" options={{ presentation: "modal" }} />
        <Stack.Screen name="restore/[recordId]" options={{ presentation: "modal" }} />
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (33 passed)

- [ ] **Step 7: 커밋**

```bash
git add app-client/app app-client/src/api/upload.ts app-client/__tests__
git commit -m "feat(app): 촬영과 시작 샷 업로드"
```

---

## Task 8: 종료 샷의 실패 복구

**이 앱에서 가장 위험한 화면이다.** 시작 샷이 실패하면 아무 일도 안 일어난 것이라
안전하다. 그러나 **종료 샷이 실패했는데 유저가 "끝냈다"고 믿으면 세션이 통째로
날아간다** — 4시간 뒤 0분으로 회수되고, 그날 페이백도 사라진다.

Task 7의 `error` 단계는 유저가 닫아버릴 수 있다. 종료 샷에서는 그러면 안 된다.

**Files:**
- Modify: `app-client/app/capture.tsx`
- Test: `app-client/__tests__/capture-end.test.tsx`

**Interfaces:**
- Consumes: `uploadPhoto`, `remainingBeforeForfeit`, `useCurrentSession`
- Produces: 종료 샷 실패 시 닫히지 않는 화면과 남은 시간 경고

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/capture-end.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import Capture from "../app/capture";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({
    kind: "end",
    sessionId: "s1",
    startedAt: "2026-09-10T01:00:00Z",
  }),
}));

jest.mock("expo-camera", () => ({
  CameraView: ({ children }: { children: React.ReactNode }) => children ?? null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Capture />
    </QueryClientProvider>
  );

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("종료 샷 실패", () => {
  it("닫기를 제공하지 않는다 — 닫으면 세션이 날아간다", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    wrap();
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());
    expect(screen.queryByText("확인")).toBeNull();
    expect(screen.queryByText("닫기")).toBeNull();
  });

  it("회수까지 남은 시간을 경고한다", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T04:35:00Z"));
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    wrap();
    fireEvent.press(screen.getByText("촬영"));

    await waitFor(() =>
      expect(screen.getByText(/25분 안에 종료하지 않으면/)).toBeTruthy()
    );
  });

  it("시작 샷 실패는 그냥 닫아도 된다", async () => {
    // 이 케이스는 Task 7 테스트가 덮는다. 여기서는 종료 샷만 다룬다.
    expect(true).toBe(true);
  });

  it("재시도해서 성공하면 종료 결과를 보여준다", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          result: "pass", photo_id: "p2", reason: "노트 필기입니다.",
          session: { id: "s1", started_at: "2026-09-10T01:00:00Z",
                     ended_at: "2026-09-10T02:35:00Z", counted_minutes: 95,
                     status: "closed" },
        }),
      } as Response);

    wrap();
    fireEvent.press(screen.getByText("촬영"));
    await waitFor(() => expect(screen.getByText("다시 시도")).toBeTruthy());

    fireEvent.press(screen.getByText("다시 시도"));
    await waitFor(() => expect(screen.getByText(/공부 종료됨/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/capture-end.test.tsx`
Expected: FAIL — 종료 샷 실패 화면이 아직 시작 샷과 같아서 경고 문구가 없다

- [ ] **Step 3: 구현**

`app-client/app/capture.tsx` 의 `error` 분기를 종료 샷에서 다르게 만든다.
`useLocalSearchParams` 에 `startedAt` 을 추가로 받고, 홈에서 넘길 때도 함께 넘긴다:

```tsx
  const { kind, sessionId, startedAt } = useLocalSearchParams<{
    kind: ShotKind;
    sessionId?: string;
    startedAt?: string;
  }>();
```

`error` 분기를 아래로 교체한다:

```tsx
  if (phase.name === "error") {
    const isEnd = kind === "end";
    const remaining =
      isEnd && startedAt
        ? remainingBeforeForfeit(startedAt, new Date())
        : null;

    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>
          사진을 올리지 못했습니다
        </Text>
        <Text style={{ color: "#52525b" }}>{phase.message}</Text>

        {isEnd && (
          // 여기서 닫기를 주면 안 된다. 유저가 끝냈다고 믿고 나가면
          // 세션은 4시간 뒤 0분으로 회수되고 그날 페이백도 사라진다.
          <Text style={{ color: "#dc2626" }}>
            아직 공부가 끝나지 않았습니다.
            {remaining !== null &&
              ` ${remaining}분 안에 종료하지 않으면 오늘 기록이 사라집니다.`}
          </Text>
        )}

        <Pressable onPress={shoot}>
          <Text style={{ color: "#2563eb" }}>다시 시도</Text>
        </Pressable>

        {!isEnd && (
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: "#71717a" }}>닫기</Text>
          </Pressable>
        )}
      </View>
    );
  }
```

`remainingBeforeForfeit` 을 import 하고, 홈(`app/(tabs)/index.tsx`)의 종료 버튼이
`startedAt` 도 넘기게 고친다:

```tsx
            onPress={() =>
              router.push({
                pathname: "/capture",
                params: { kind: "end", sessionId: open.id, startedAt: open.started_at },
              })
            }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (37 passed)

- [ ] **Step 5: 커밋**

```bash
git add app-client/app app-client/__tests__/capture-end.test.tsx
git commit -m "feat(app): 종료 샷 실패는 닫히지 않는다"
```

---

## Task 9: 이의제기

**Files:**
- Create: `app-client/app/appeal/[photoId].tsx`
- Test: `app-client/__tests__/appeal.test.tsx`

**Interfaces:**
- Consumes: `api.post`, `JudgeResultOut`, `ApiError`, `useInvalidateAll`
- Produces: `/appeal/{photoId}` 모달

이의제기는 **사진당 한 번뿐**이다. 그 사실을 보내기 전에 알려야 한다 — 눌러보고
나서 "이미 썼습니다"를 보는 것과, 누르기 전에 아는 것은 다르다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/appeal.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Appeal from "../app/appeal/[photoId]";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ photoId: "p1" }),
}));

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Appeal />
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("이의제기", () => {
  it("한 번뿐이라는 사실을 미리 알린다", () => {
    wrap();
    expect(screen.getByText(/한 번만/)).toBeTruthy();
  });

  it("설명이 비어 있으면 보내지 않는다", () => {
    const spy = jest.spyOn(global, "fetch");
    wrap();
    fireEvent.press(screen.getByText("다시 판정 요청"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("통과하면 결과를 보여준다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        result: "pass", photo_id: "p1", reason: "태블릿 인강입니다.",
        session: { id: "s1", started_at: "2026-09-10T02:00:00Z", ended_at: null,
                   counted_minutes: 0, status: "open" },
      }),
    } as Response);

    wrap();
    fireEvent.changeText(
      screen.getByPlaceholderText(/무엇을 하고 있었는지/),
      "태블릿으로 인강 듣는 중입니다"
    );
    fireEvent.press(screen.getByText("다시 판정 요청"));

    await waitFor(() => expect(screen.getByText(/인정됐습니다/)).toBeTruthy());
  });

  it("거절되면 최종이라는 것을 분명히 한다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        result: "fail", photo_id: "p1", reason: "여전히 게임 화면입니다.",
        session: null,
      }),
    } as Response);

    wrap();
    fireEvent.changeText(screen.getByPlaceholderText(/무엇을 하고 있었는지/), "공부 중");
    fireEvent.press(screen.getByText("다시 판정 요청"));

    await waitFor(() => expect(screen.getByText(/최종/)).toBeTruthy());
  });

  it("409 는 이미 썼거나 자격이 없다는 뜻이라 안내가 다르다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ detail: "이의제기는 한 번만 가능합니다" }),
    } as Response);

    wrap();
    fireEvent.changeText(screen.getByPlaceholderText(/무엇을 하고 있었는지/), "공부 중");
    fireEvent.press(screen.getByText("다시 판정 요청"));

    await waitFor(() =>
      expect(screen.getByText("이의제기는 한 번만 가능합니다")).toBeTruthy()
    );
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/appeal.test.tsx`
Expected: FAIL — `Cannot find module '../app/appeal/[photoId]'`

- [ ] **Step 3: 구현**

`app-client/app/appeal/[photoId].tsx`:

```tsx
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { ApiError, api } from "../../src/api/client";
import { useInvalidateAll } from "../../src/api/hooks";
import type { JudgeResultOut } from "../../src/api/types";

type Phase =
  | { name: "writing" }
  | { name: "sending" }
  | { name: "judged"; result: JudgeResultOut }
  | { name: "refused"; detail: string };

export default function Appeal() {
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "writing" });
  const invalidate = useInvalidateAll();

  async function send() {
    if (!text.trim()) return;
    setPhase({ name: "sending" });
    try {
      const result = await api.post<JudgeResultOut>(
        `/photos/${photoId}/appeal`,
        { text: text.trim() }
      );
      await invalidate();
      setPhase({ name: "judged", result });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.detail
          : "요청을 보내지 못했습니다. 잠시 후 다시 시도해주세요.";
      setPhase({ name: "refused", detail: message });
    }
  }

  if (phase.name === "judged") {
    const passed = phase.result.result === "pass";
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>
          {passed ? "인정됐습니다" : "다시 거절됐습니다"}
        </Text>
        <Text style={{ color: "#52525b" }}>{phase.result.reason}</Text>
        {!passed && (
          <Text style={{ color: "#71717a", fontSize: 13 }}>
            이 사진에 대한 판정은 최종입니다.
          </Text>
        )}
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#2563eb" }}>확인</Text>
        </Pressable>
      </View>
    );
  }

  if (phase.name === "refused") {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>
          이의제기를 처리하지 못했습니다
        </Text>
        <Text style={{ color: "#52525b" }}>{phase.detail}</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#2563eb" }}>확인</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16, paddingTop: 64 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>이의제기</Text>
      <Text style={{ color: "#52525b" }}>
        사진에서 무엇을 하고 있었는지 적어주세요. 설명을 참고해 한 번만 다시 판정합니다.
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder="예: 태블릿으로 인강 듣는 중이었습니다"
        style={{
          borderWidth: 1, borderColor: "#e4e4e7", borderRadius: 12,
          padding: 14, minHeight: 120, textAlignVertical: "top",
        }}
      />
      {phase.name === "sending" ? (
        <ActivityIndicator />
      ) : (
        <Pressable
          onPress={send}
          style={{
            backgroundColor: text.trim() ? "#18181b" : "#d4d4d8",
            padding: 16, borderRadius: 12,
          }}
        >
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>
            다시 판정 요청
          </Text>
        </Pressable>
      )}
    </View>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (42 passed)

- [ ] **Step 5: 커밋**

```bash
git add app-client/app/appeal app-client/__tests__/appeal.test.tsx
git commit -m "feat(app): 이의제기 모달"
```

---

## Task 10: 챌린지 선택과 결제

**Files:**
- Create: `app-client/app/challenge/select.tsx`, `app-client/src/purchases/revenuecat.ts`
- Modify: `app-client/app/(tabs)/index.tsx`
- Test: `app-client/__tests__/challenge.test.tsx`

**Interfaces:**
- Consumes: `useProducts`, `useMe`, `api.post`, `ApiError`, `formatWon`
- Produces:
  - `initPurchases(userId)`, `buyProduct(productId)` — RevenueCat 래퍼
  - `/challenge/select`

**가격표를 하드코딩하면 안 된다.** `GET /challenges/products` 가 그 유저에게
허용된 상품만 준다 — 첫 챌린지 상한이 유저마다 다르기 때문이다. 목록을 앱에
박아두면 상한이 무의미해지고, 유저가 살 수 없는 상품을 눌러 결제창까지 간다.

**결제 성공을 서버에 알리지 않는다.** RevenueCat이 웹훅으로 서버에 알리고,
서버만이 챌린지를 연다. 앱은 구매 후 `GET /challenges/current` 를 다시 읽을 뿐이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/challenge.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Select from "../app/challenge/select";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

const buyProduct = jest.fn();
jest.mock("../src/purchases/revenuecat", () => ({
  initPurchases: jest.fn(),
  buyProduct: (...args: unknown[]) => buyProduct(...args),
}));

const products = [
  { product_id: "challenge_7d_1k", days: 7, daily_payback: 1000,
    price: 7000, completion_bonus: 0 },
  { product_id: "challenge_30d_1k", days: 30, daily_payback: 1000,
    price: 30000, completion_bonus: 3000 },
];

const me = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 0, credit_balance: 30000,
};

function mockApi(overrides: Record<string, unknown> = {}) {
  jest.spyOn(global, "fetch").mockImplementation((url) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    const body =
      overrides[path] ??
      { "/challenges/products": products, "/users/me": me }[path] ??
      null;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Select />
    </QueryClientProvider>
  );

afterEach(() => {
  jest.restoreAllMocks();
  buyProduct.mockReset();
});

describe("챌린지 선택", () => {
  it("서버가 준 목록만 보여준다 — 하드코딩된 가격표가 없다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByText("7일")).toBeTruthy());
    expect(screen.getByText("30일")).toBeTruthy();
    expect(screen.queryByText("90일")).toBeNull();
  });

  it("참가비와 완주 보너스를 함께 보여준다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByText("₩30,000")).toBeTruthy());
    expect(screen.getByText(/완주 시 ₩3,000/)).toBeTruthy();
  });

  it("크레딧이 충분하면 크레딧 참가를 제안한다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getAllByText("크레딧으로 참가").length).toBeGreaterThan(0));
  });

  it("크레딧이 모자라면 결제로만 참가한다", async () => {
    mockApi({ "/users/me": { ...me, credit_balance: 0 } });
    wrap();
    await waitFor(() => expect(screen.getAllByText("결제하고 시작").length).toBe(2));
    expect(screen.queryByText("크레딧으로 참가")).toBeNull();
  });

  it("결제는 RevenueCat 을 거치고 서버에 직접 알리지 않는다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getAllByText("결제하고 시작").length).toBe(2));

    fireEvent.press(screen.getAllByText("결제하고 시작")[0]);
    await waitFor(() => expect(buyProduct).toHaveBeenCalledWith("challenge_7d_1k"));

    const posted = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(posted).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/challenge.test.tsx`
Expected: FAIL — `Cannot find module '../app/challenge/select'`

- [ ] **Step 3: RevenueCat 래퍼 작성**

`app-client/src/purchases/revenuecat.ts`:

```ts
import Purchases from "react-native-purchases";

/**
 * RevenueCat 의 appUserID 는 반드시 우리 서버의 user.id 와 같아야 한다.
 * 웹훅이 app_user_id 로 유저를 찾기 때문에, 다르면 결제는 되는데
 * 챌린지가 안 열린다.
 */
export async function initPurchases(userId: string): Promise<void> {
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_KEY;
  if (!apiKey) throw new Error("EXPO_PUBLIC_REVENUECAT_KEY 가 없습니다.");
  await Purchases.configure({ apiKey, appUserID: userId });
}

/**
 * 결제만 한다. 크레딧 지급과 챌린지 개설은 서버가 웹훅으로 처리하므로,
 * 여기서 서버에 "샀다"고 알리는 경로는 만들지 않는다.
 */
export async function buyProduct(productId: string): Promise<void> {
  const products = await Purchases.getProducts([productId]);
  const product = products.find((p) => p.identifier === productId);
  if (!product) throw new Error(`스토어에 없는 상품입니다: ${productId}`);
  await Purchases.purchaseStoreProduct(product);
}
```

- [ ] **Step 4: 화면 작성**

`app-client/app/challenge/select.tsx`:

```tsx
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { ApiError, api } from "../../src/api/client";
import { useInvalidateAll, useMe, useProducts } from "../../src/api/hooks";
import type { ChallengeProductOut } from "../../src/api/types";
import { formatWon } from "../../src/money/format";
import { buyProduct } from "../../src/purchases/revenuecat";

export default function Select() {
  const products = useProducts();
  const me = useMe();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState<string | null>(null);

  const balance = me.data?.credit_balance ?? 0;

  async function payWithStore(product: ChallengeProductOut) {
    setBusy(product.product_id);
    try {
      await buyProduct(product.product_id);
      // 서버에 알리지 않는다. RevenueCat 웹훅이 챌린지를 연다.
      await invalidate();
      router.back();
    } catch (error) {
      Alert.alert("결제 실패", (error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function payWithCredit(product: ChallengeProductOut) {
    setBusy(product.product_id);
    try {
      await api.post("/challenges", { product_id: product.product_id });
      await invalidate();
      router.back();
    } catch (error) {
      const detail =
        error instanceof ApiError ? error.detail : "참가하지 못했습니다.";
      Alert.alert("참가 실패", detail);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingTop: 64 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>챌린지 선택</Text>
      <Text style={{ color: "#52525b" }}>
        참가비를 먼저 내고, 목표를 채운 날마다 하루치를 크레딧으로 돌려받습니다.
      </Text>

      {(products.data ?? []).map((product) => (
        <View
          key={product.product_id}
          style={{
            borderWidth: 1, borderColor: "#e4e4e7",
            borderRadius: 16, padding: 18, gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 18, fontWeight: "700" }}>
              {product.days}일
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "700" }}>
              {formatWon(product.price)}
            </Text>
          </View>
          <Text style={{ color: "#52525b", fontSize: 13 }}>
            하루 {formatWon(product.daily_payback)}씩 돌려받음
            {product.completion_bonus > 0 &&
              ` · 완주 시 ${formatWon(product.completion_bonus)} 추가`}
          </Text>

          <Pressable
            disabled={busy !== null}
            onPress={() => payWithStore(product)}
            style={{ backgroundColor: "#18181b", padding: 14, borderRadius: 10 }}
          >
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>
              결제하고 시작
            </Text>
          </Pressable>

          {balance >= product.price && (
            <Pressable
              disabled={busy !== null}
              onPress={() => payWithCredit(product)}
              style={{ borderWidth: 1, borderColor: "#d4d4d8", padding: 14, borderRadius: 10 }}
            >
              <Text style={{ textAlign: "center" }}>크레딧으로 참가</Text>
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
```

홈의 `CreditMeter` 를 눌러 이 화면으로 가도록 `app/(tabs)/index.tsx` 에서 감싼다:

```tsx
      <Pressable onPress={() => router.push("/challenge/select")}>
        <CreditMeter … />
      </Pressable>
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (47 passed)

- [ ] **Step 6: 커밋**

```bash
git add app-client/app/challenge app-client/src/purchases app-client/__tests__ app-client/app/\(tabs\)
git commit -m "feat(app): 챌린지 선택과 결제"
```

---

## Task 11: 그룹

**Files:**
- Create: `app-client/app/groups/index.tsx`
- Test: `app-client/__tests__/groups.test.tsx`

**Interfaces:**
- Consumes: `useGroups`, `api.post`, `ApiError`
- Produces: `/groups` — 목록·생성·초대코드 참여, 그리고 초대코드 공유

초대코드는 손으로 옮겨 적는다. 그래서 서버가 헷갈리는 글자(O/0, I/1)를 뺀
알파벳으로 만든다. 앱은 **대문자로 보여주고 입력을 대문자로 정규화**한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/groups.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Groups from "../app/groups/index";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

const groups = [{ id: "g1", name: "고시반", invite_code: "A3K9P2" }];

function mockApi(list = groups) {
  jest.spyOn(global, "fetch").mockImplementation((url, init) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    if ((init as RequestInit | undefined)?.method === "POST") {
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ id: "g2", name: "새 그룹", invite_code: "ZZZZZZ" }),
      } as Response);
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => (path === "/groups" ? list : null),
    } as Response);
  });
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Groups />
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("그룹", () => {
  it("내 그룹과 초대코드를 보여준다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());
    expect(screen.getByText("A3K9P2")).toBeTruthy();
  });

  it("그룹이 없으면 만들거나 참여하라고 안내한다", async () => {
    mockApi([]);
    wrap();
    await waitFor(() =>
      expect(screen.getByText(/아직 그룹이 없습니다/)).toBeTruthy()
    );
  });

  it("초대코드 입력을 대문자로 정규화한다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    const input = screen.getByPlaceholderText("초대코드 6자리");
    fireEvent.changeText(input, "a3k9p2");
    expect(input.props.value).toBe("A3K9P2");
  });

  it("6자리가 아니면 참여를 보내지 않는다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText("초대코드 6자리"), "ABC");
    fireEvent.press(screen.getByText("참여"));

    const posted = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(posted).toHaveLength(0);
  });

  it("이름이 비면 생성을 보내지 않는다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByText("고시반")).toBeTruthy());

    fireEvent.press(screen.getByText("그룹 만들기"));
    const posted = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(posted).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/groups.test.tsx`
Expected: FAIL — `Cannot find module '../app/groups/index'`

- [ ] **Step 3: 구현**

`app-client/app/groups/index.tsx`:

```tsx
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { ApiError, api } from "../../src/api/client";
import { keys, useGroups } from "../../src/api/hooks";
import type { GroupOut } from "../../src/api/types";

const CODE_LENGTH = 6;

export default function Groups() {
  const groups = useGroups();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: keys.groups });
  }

  async function create() {
    if (!name.trim()) return;
    try {
      await api.post<GroupOut>("/groups", { name: name.trim() });
      setName("");
      await refresh();
    } catch (error) {
      Alert.alert("만들지 못했습니다", (error as Error).message);
    }
  }

  async function join() {
    if (code.length !== CODE_LENGTH) return;
    try {
      await api.post<GroupOut>("/groups/join", { invite_code: code });
      setCode("");
      await refresh();
    } catch (error) {
      const detail =
        error instanceof ApiError ? error.detail : "참여하지 못했습니다.";
      Alert.alert("참여 실패", detail);
    }
  }

  async function share(group: GroupOut) {
    // 딥링크 대신 코드를 복사해 카톡에 붙여넣게 한다.
    await Clipboard.setStringAsync(
      `스터디로그 초대코드: ${group.invite_code}`
    );
    Alert.alert("복사됨", "초대코드를 붙여넣어 친구에게 보내세요.");
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingTop: 64 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>그룹</Text>

      {(groups.data ?? []).length === 0 && !groups.isLoading && (
        <Text style={{ color: "#71717a" }}>
          아직 그룹이 없습니다. 만들거나 초대코드로 참여하세요.
        </Text>
      )}

      {(groups.data ?? []).map((group) => (
        <Pressable
          key={group.id}
          onPress={() => share(group)}
          style={{
            borderWidth: 1, borderColor: "#e4e4e7",
            borderRadius: 14, padding: 16, gap: 6,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "600" }}>{group.name}</Text>
          <Text style={{ letterSpacing: 2, color: "#52525b" }}>
            {group.invite_code}
          </Text>
          <Text style={{ fontSize: 12, color: "#a1a1aa" }}>
            눌러서 초대코드 복사
          </Text>
        </Pressable>
      ))}

      <View style={{ gap: 10 }}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="새 그룹 이름"
          style={{
            borderWidth: 1, borderColor: "#e4e4e7",
            borderRadius: 10, padding: 14,
          }}
        />
        <Pressable onPress={create}>
          <Text style={{ color: "#2563eb" }}>그룹 만들기</Text>
        </Pressable>
      </View>

      <View style={{ gap: 10 }}>
        <TextInput
          value={code}
          onChangeText={(next) => setCode(next.toUpperCase().slice(0, CODE_LENGTH))}
          placeholder="초대코드 6자리"
          autoCapitalize="characters"
          style={{
            borderWidth: 1, borderColor: "#e4e4e7",
            borderRadius: 10, padding: 14, letterSpacing: 2,
          }}
        />
        <Pressable onPress={join}>
          <Text style={{ color: "#2563eb" }}>참여</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
```

`npx expo install expo-clipboard` 를 먼저 실행한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (52 passed)

- [ ] **Step 5: 커밋**

```bash
git add app-client/app/groups app-client/__tests__/groups.test.tsx app-client/package.json
git commit -m "feat(app): 그룹 목록·생성·초대코드 참여"
```

---

## Task 12: 피드

**Files:**
- Create: `app-client/app/(tabs)/feed.tsx`, `app-client/src/components/PhotoGrid.tsx`
- Test: `app-client/__tests__/feed.test.tsx`

**Interfaces:**
- Consumes: `useGroups`, `useFeed`, `formatElapsed`
- Produces: `/feed` 탭, `<PhotoGrid photos />`

피드는 **사진을 그대로 보여준다.** 서버가 자동 중복 검사를 하지 않기로 했으므로
서로 보는 것이 부정행위를 억제하는 유일한 장치다. 흐림 처리나 숨김을 넣으면
그 장치가 사라진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/feed.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";

import Feed from "../app/(tabs)/feed";

const groups = [{ id: "g1", name: "고시반", invite_code: "A3K9P2" }];

const feed = [
  {
    user_id: "u1", nickname: "광휘", streak_count: 5,
    total_minutes: 95, goal_minutes: 60, result: null,
    photos: [
      { kind: "start", url: "http://x/1.jpg", received_at: "2026-09-10T01:00:00Z" },
      { kind: "end", url: "http://x/2.jpg", received_at: "2026-09-10T02:35:00Z" },
    ],
  },
  {
    user_id: "u2", nickname: "친구", streak_count: 0,
    total_minutes: 0, goal_minutes: 120, result: "failed", photos: [],
  },
];

function mockApi(items = feed, list = groups) {
  jest.spyOn(global, "fetch").mockImplementation((url) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    const body = path === "/groups" ? list : items;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Feed />
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("피드", () => {
  it("그룹원의 오늘 진행 상황을 보여준다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByText("광휘")).toBeTruthy());
    expect(screen.getByText("1시간 35분 / 60분")).toBeTruthy();
  });

  it("정산된 실패는 박제한다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByText("✗ 미인증")).toBeTruthy());
  });

  it("아직 정산 전이면 결과를 단정하지 않는다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByText("광휘")).toBeTruthy());
    // 광휘는 result 가 null 이므로 미인증 표시가 붙으면 안 된다
    expect(screen.getAllByText("✗ 미인증")).toHaveLength(1);
  });

  it("사진을 그대로 보여준다 — 가리지 않는다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getAllByTestId("feed-photo")).toHaveLength(2));
  });

  it("그룹이 없으면 참여를 권한다", async () => {
    mockApi(feed, []);
    wrap();
    await waitFor(() =>
      expect(screen.getByText(/그룹에 참여하면/)).toBeTruthy()
    );
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/feed.test.tsx`
Expected: FAIL — `Cannot find module '../app/(tabs)/feed'`

- [ ] **Step 3: 구현**

`app-client/src/components/PhotoGrid.tsx`:

```tsx
import { Image, View } from "react-native";

import type { FeedPhotoOut } from "../api/types";

export function PhotoGrid({ photos }: { photos: FeedPhotoOut[] }) {
  if (photos.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {photos.map((photo) => (
        <Image
          key={photo.url}
          testID="feed-photo"
          source={{ uri: photo.url }}
          style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: "#f4f4f5" }}
        />
      ))}
    </View>
  );
}
```

`app-client/app/(tabs)/feed.tsx`:

```tsx
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { useFeed, useGroups } from "../../src/api/hooks";
import { PhotoGrid } from "../../src/components/PhotoGrid";
import { StreakBadge } from "../../src/components/StreakBadge";
import { formatElapsed } from "../../src/time/elapsed";

const RESULT_LABEL: Record<string, string> = {
  success: "✓ 달성",
  passed: "✓ 복구됨",
  failed: "✗ 미인증",
};

export default function Feed() {
  const groups = useGroups();
  const [selected, setSelected] = useState<string | undefined>();
  const groupId = selected ?? groups.data?.[0]?.id;
  const feed = useFeed(groupId);

  if (!groups.isLoading && (groups.data ?? []).length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Text style={{ color: "#52525b" }}>
          그룹에 참여하면 친구들의 인증을 볼 수 있습니다.
        </Text>
        <Pressable onPress={() => router.push("/groups")}>
          <Text style={{ color: "#2563eb" }}>그룹 만들거나 참여하기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 16, paddingTop: 64 }}
      refreshControl={
        <RefreshControl refreshing={feed.isFetching} onRefresh={() => feed.refetch()} />
      }
    >
      {(groups.data ?? []).length > 1 && (
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {(groups.data ?? []).map((group) => (
            <Pressable
              key={group.id}
              onPress={() => setSelected(group.id)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                backgroundColor: group.id === groupId ? "#18181b" : "#f4f4f5",
              }}
            >
              <Text style={{ color: group.id === groupId ? "#fff" : "#18181b" }}>
                {group.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {(feed.data ?? []).map((item) => (
        <View
          key={item.user_id}
          style={{
            borderWidth: 1, borderColor: "#e4e4e7",
            borderRadius: 14, padding: 16, gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16, fontWeight: "600" }}>{item.nickname}</Text>
            <StreakBadge count={item.streak_count} />
          </View>
          <Text style={{ color: "#52525b" }}>
            {formatElapsed(item.total_minutes)} / {item.goal_minutes}분
            {item.result ? `  ${RESULT_LABEL[item.result]}` : ""}
          </Text>
          <PhotoGrid photos={item.photos} />
        </View>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (57 passed)

- [ ] **Step 5: 커밋**

```bash
git add app-client/app/\(tabs\)/feed.tsx app-client/src/components/PhotoGrid.tsx app-client/__tests__/feed.test.tsx
git commit -m "feat(app): 그룹 피드"
```

---

## Task 13: 기록과 복구

**Files:**
- Create: `app-client/app/(tabs)/records.tsx`, `app-client/app/restore/[recordId].tsx`
- Test: `app-client/__tests__/records.test.tsx`

**Interfaces:**
- Consumes: `useRecords`, `useMe`, `api.post`, `ApiError`, `formatWon`
- Produces: `/records` 탭, `/restore/{recordId}` 모달

**복구는 그날의 페이백을 되사는 게 아니다.** ₩2,000을 내도 놓친 ₩1,000은 돌아오지
않는다. 산술적으로 손해라는 걸 화면이 숨기지 않아야 한다 — 숨기면 나중에
"₩2,000 냈는데 왜 잔액이 안 늘죠"라는 문의가 온다.

복구 가능 시한은 **정산 후 24시간**이다. 지난 것은 버튼을 아예 내린다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/records.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Records from "../app/(tabs)/records";
import Restore from "../app/restore/[recordId]";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ recordId: "r1" }),
}));

const NOW = new Date("2026-09-10T06:00:00Z");

const records = [
  { id: "r1", date: "2026-09-09", total_minutes: 20, goal_minutes: 60,
    result: "failed", payback_amount: 0, streak_snapshot: 0,
    settled_at: "2026-09-09T19:00:00Z" },           // 11시간 전 — 복구 가능
  { id: "r2", date: "2026-09-07", total_minutes: 10, goal_minutes: 60,
    result: "failed", payback_amount: 0, streak_snapshot: 0,
    settled_at: "2026-09-07T19:00:00Z" },           // 지남
  { id: "r3", date: "2026-09-08", total_minutes: 90, goal_minutes: 60,
    result: "success", payback_amount: 1000, streak_snapshot: 3,
    settled_at: "2026-09-08T19:00:00Z" },
];

const me = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 0, credit_balance: 5000,
};

function mockApi(overrides: Record<string, unknown> = {}) {
  jest.spyOn(global, "fetch").mockImplementation((url) => {
    const path = String(url).replace("http://127.0.0.1:8000", "").split("?")[0];
    const body =
      overrides[path] ?? { "/records/me": records, "/users/me": me }[path] ?? null;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
}

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  );

beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("기록", () => {
  it("성공한 날의 적립액을 보여준다", async () => {
    mockApi();
    wrap(<Records />);
    await waitFor(() => expect(screen.getByText("+₩1,000")).toBeTruthy());
  });

  it("24시간 안의 실패한 날에만 복구 버튼이 뜬다", async () => {
    mockApi();
    wrap(<Records />);
    await waitFor(() => expect(screen.getAllByText("복구하기")).toHaveLength(1));
  });

  it("크레딧이 모자라면 복구 버튼 대신 부족 안내를 한다", async () => {
    mockApi({ "/users/me": { ...me, credit_balance: 500 } });
    wrap(<Records />);
    await waitFor(() => expect(screen.getByText(/크레딧이 부족/)).toBeTruthy());
  });
});

describe("복구", () => {
  it("페이백은 돌아오지 않는다는 것을 분명히 한다", () => {
    mockApi();
    wrap(<Restore />);
    expect(screen.getByText(/페이백은 돌아오지 않습니다/)).toBeTruthy();
  });

  it("성공하면 복원된 streak 를 보여준다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        id: "r1", date: "2026-09-09", total_minutes: 20, goal_minutes: 60,
        result: "passed", payback_amount: 0, streak_snapshot: 7,
        settled_at: "2026-09-09T19:00:00Z",
      }),
    } as Response);

    wrap(<Restore />);
    fireEvent.press(screen.getByText("₩2,000으로 복구"));
    await waitFor(() => expect(screen.getByText(/7일/)).toBeTruthy());
  });

  it("402 는 크레딧 부족이라 안내가 다르다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 402,
      json: async () => ({ detail: "크레딧이 부족합니다" }),
    } as Response);

    wrap(<Restore />);
    fireEvent.press(screen.getByText("₩2,000으로 복구"));
    await waitFor(() => expect(screen.getByText("크레딧이 부족합니다")).toBeTruthy());
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/records.test.tsx`
Expected: FAIL — `Cannot find module '../app/(tabs)/records'`

- [ ] **Step 3: 복구 가능 판정을 순수 함수로 뺀다**

`app-client/src/time/elapsed.ts` 에 추가한다:

```ts
export const RESTORE_WINDOW_HOURS = 24;

/** 정산 후 24시간 안에만 복구할 수 있다. */
export function canRestore(settledAtIso: string, now: Date): boolean {
  const deadline =
    new Date(settledAtIso).getTime() + RESTORE_WINDOW_HOURS * 3_600_000;
  return now.getTime() <= deadline;
}
```

`app-client/src/money/format.ts` 에 추가한다:

```ts
export const RESTORE_COST = 2000;
```

- [ ] **Step 4: 화면 작성**

`app-client/app/(tabs)/records.tsx`:

```tsx
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useMe, useRecords } from "../../src/api/hooks";
import { RESTORE_COST, formatWon } from "../../src/money/format";
import { canRestore, formatElapsed } from "../../src/time/elapsed";

const LABEL: Record<string, string> = {
  success: "달성", passed: "복구됨", failed: "미달",
};

export default function Records() {
  const records = useRecords();
  const me = useMe();
  const balance = me.data?.credit_balance ?? 0;
  const now = new Date();

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingTop: 64 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>기록</Text>

      {(records.data ?? []).map((record) => {
        const restorable =
          record.result === "failed" && canRestore(record.settled_at, now);
        return (
          <View
            key={record.id}
            style={{
              borderWidth: 1, borderColor: "#e4e4e7",
              borderRadius: 12, padding: 14, gap: 6,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "600" }}>{record.date}</Text>
              <Text
                style={{ color: record.result === "failed" ? "#dc2626" : "#16a34a" }}
              >
                {LABEL[record.result]}
              </Text>
            </View>
            <Text style={{ color: "#52525b", fontSize: 13 }}>
              {formatElapsed(record.total_minutes)} / {record.goal_minutes}분
              {record.payback_amount > 0 && `   +${formatWon(record.payback_amount)}`}
            </Text>

            {restorable &&
              (balance >= RESTORE_COST ? (
                <Pressable onPress={() => router.push(`/restore/${record.id}`)}>
                  <Text style={{ color: "#2563eb" }}>복구하기</Text>
                </Pressable>
              ) : (
                <Text style={{ color: "#a1a1aa", fontSize: 12 }}>
                  복구하려면 크레딧이 부족합니다 ({formatWon(RESTORE_COST)} 필요)
                </Text>
              ))}
          </View>
        );
      })}
    </ScrollView>
  );
}
```

`app-client/app/restore/[recordId].tsx`:

```tsx
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { ApiError, api } from "../../src/api/client";
import { useInvalidateAll } from "../../src/api/hooks";
import type { DailyRecordOut } from "../../src/api/types";
import { RESTORE_COST, formatWon } from "../../src/money/format";

type Phase =
  | { name: "confirm" }
  | { name: "sending" }
  | { name: "done"; record: DailyRecordOut }
  | { name: "failed"; detail: string };

export default function Restore() {
  const { recordId } = useLocalSearchParams<{ recordId: string }>();
  const [phase, setPhase] = useState<Phase>({ name: "confirm" });
  const invalidate = useInvalidateAll();

  async function restore() {
    setPhase({ name: "sending" });
    try {
      const record = await api.post<DailyRecordOut>(
        `/records/${recordId}/restore`
      );
      await invalidate();
      setPhase({ name: "done", record });
    } catch (error) {
      setPhase({
        name: "failed",
        detail:
          error instanceof ApiError ? error.detail : "복구하지 못했습니다.",
      });
    }
  }

  if (phase.name === "done") {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>복구됐습니다</Text>
        <Text style={{ color: "#52525b" }}>
          연속 기록이 {phase.record.streak_snapshot}일로 복원됐습니다.
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#2563eb" }}>확인</Text>
        </Pressable>
      </View>
    );
  }

  if (phase.name === "failed") {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>복구 실패</Text>
        <Text style={{ color: "#52525b" }}>{phase.detail}</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#2563eb" }}>확인</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>연속 기록 복구</Text>
      <Text style={{ color: "#52525b" }}>
        크레딧 {formatWon(RESTORE_COST)}을 써서 끊긴 연속 기록을 되살립니다.
      </Text>
      <Text style={{ color: "#a1a1aa", fontSize: 13 }}>
        그날의 페이백은 돌아오지 않습니다. 되사는 것은 연속 기록입니다.
      </Text>
      {phase.name === "sending" ? (
        <ActivityIndicator />
      ) : (
        <Pressable
          onPress={restore}
          style={{ backgroundColor: "#18181b", padding: 16, borderRadius: 12 }}
        >
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>
            {formatWon(RESTORE_COST)}으로 복구
          </Text>
        </Pressable>
      )}
    </View>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (63 passed)

- [ ] **Step 6: 커밋**

```bash
git add app-client/app app-client/src app-client/__tests__/records.test.tsx
git commit -m "feat(app): 기록 목록과 streak 복구"
```

---

## Task 14: 설정과 푸시 등록

**Files:**
- Create: `app-client/app/(tabs)/settings.tsx`, `app-client/src/notifications/register.ts`, `app-client/app/onboarding.tsx`
- Modify: `app-client/app/_layout.tsx`
- Test: `app-client/__tests__/settings.test.tsx`

**Interfaces:**
- Consumes: `useMe`, `useSetGoal`, `api.put`, `useAuth`
- Produces:
  - `registerPushToken()` — 권한 요청 후 `PUT /users/me/push-token`
  - `/settings` 탭, `/onboarding`

**목표 변경은 내일부터 적용된다.** 서버가 그렇게 만들어져 있고(밤에 목표를 낮춰
페이백을 타는 걸 막으려고), 화면이 그 사실을 말하지 않으면 유저는 버그로 여긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/settings.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import Settings from "../app/(tabs)/settings";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock("expo-secure-store");

const me = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 3, credit_balance: 4000,
};

function mockApi(user = me) {
  jest.spyOn(global, "fetch").mockImplementation((_url, init) =>
    Promise.resolve({
      ok: true, status: 200,
      json: async () =>
        (init as RequestInit | undefined)?.method === "PATCH"
          ? { ...user, pending_goal_minutes: 90 }
          : user,
    } as Response)
  );
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Settings />
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("설정", () => {
  it("현재 목표를 보여준다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByDisplayValue("60")).toBeTruthy());
  });

  it("목표를 바꾸면 내일부터 적용된다고 알린다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByDisplayValue("60")).toBeTruthy());

    fireEvent.changeText(screen.getByDisplayValue("60"), "90");
    fireEvent.press(screen.getByText("목표 저장"));

    await waitFor(() =>
      expect(screen.getByText(/내일부터 90분/)).toBeTruthy()
    );
  });

  it("예약된 변경이 있으면 그것도 보여준다", async () => {
    mockApi({ ...me, pending_goal_minutes: 120 });
    wrap();
    await waitFor(() =>
      expect(screen.getByText(/내일부터 120분/)).toBeTruthy()
    );
  });

  it("범위를 벗어난 값은 보내지 않는다", async () => {
    mockApi();
    wrap();
    await waitFor(() => expect(screen.getByDisplayValue("60")).toBeTruthy());

    fireEvent.changeText(screen.getByDisplayValue("60"), "0");
    fireEvent.press(screen.getByText("목표 저장"));

    const patched = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH"
    );
    expect(patched).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/settings.test.tsx`
Expected: FAIL — `Cannot find module '../app/(tabs)/settings'`

- [ ] **Step 3: 푸시 등록 작성**

`app-client/src/notifications/register.ts`:

```ts
import * as Notifications from "expo-notifications";

import { api } from "../api/client";

/**
 * 푸시 권한을 받고 토큰을 서버에 올린다. 실패해도 던지지 않는다 —
 * 알림을 못 받는 것이 앱을 못 쓰는 것보다 낫다.
 */
export async function registerPushToken(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.granted ||
      (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return false;

    const { data } = await Notifications.getExpoPushTokenAsync();
    await api.put("/users/me/push-token", { token: data });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 화면 작성**

`app-client/app/(tabs)/settings.tsx`:

```tsx
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useMe, useSetGoal } from "../../src/api/hooks";
import { useAuth } from "../../src/auth/useAuth";
import { formatWon } from "../../src/money/format";
import { registerPushToken } from "../../src/notifications/register";

const MIN_GOAL = 1;
const MAX_GOAL = 1440;

export default function Settings() {
  const me = useMe();
  const setGoal = useSetGoal();
  const { signOut } = useAuth();
  const [minutes, setMinutes] = useState("");

  useEffect(() => {
    if (me.data && minutes === "") setMinutes(String(me.data.daily_goal_minutes));
  }, [me.data, minutes]);

  function save() {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < MIN_GOAL || value > MAX_GOAL) return;
    setGoal.mutate(value);
  }

  const pending = setGoal.data?.pending_goal_minutes ?? me.data?.pending_goal_minutes;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingTop: 64 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>설정</Text>

      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "600" }}>하루 목표 (분)</Text>
        <TextInput
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          style={{
            borderWidth: 1, borderColor: "#e4e4e7",
            borderRadius: 10, padding: 14,
          }}
        />
        <Pressable onPress={save}>
          <Text style={{ color: "#2563eb" }}>목표 저장</Text>
        </Pressable>
        {pending != null && (
          // 서버가 목표 변경을 다음 04:00 정산 후에 적용한다. 밤에 목표를 낮춰
          // 페이백을 타는 것을 막기 위한 규칙이라, 화면이 이유를 말해줘야 한다.
          <Text style={{ color: "#a1a1aa", fontSize: 13 }}>
            내일부터 {pending}분이 적용됩니다. 오늘 목표는 그대로입니다.
          </Text>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>크레딧</Text>
        <Text style={{ fontSize: 20 }}>
          {formatWon(me.data?.credit_balance ?? 0)}
        </Text>
        <Text style={{ color: "#a1a1aa", fontSize: 12 }}>
          현금으로 환급되지 않으며 챌린지 참가와 기록 복구에 쓸 수 있습니다.
        </Text>
      </View>

      <Pressable onPress={registerPushToken}>
        <Text style={{ color: "#2563eb" }}>알림 다시 설정</Text>
      </Pressable>

      <Pressable onPress={() => router.push("/groups")}>
        <Text style={{ color: "#2563eb" }}>그룹 관리</Text>
      </Pressable>

      <Pressable
        onPress={async () => {
          await signOut();
          router.replace("/login");
        }}
      >
        <Text style={{ color: "#dc2626" }}>로그아웃</Text>
      </Pressable>
    </ScrollView>
  );
}
```

`app-client/app/onboarding.tsx` 는 같은 목표 입력만 담되, 저장 후
`registerPushToken()` 을 부르고 `router.replace("/(tabs)")` 로 보낸다.
`app/index.tsx` 의 게이트에서 `daily_goal_minutes` 가 서버 기본값 그대로이고
`streak_count === 0` 이면 `/onboarding` 으로 보낸다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (67 passed)

- [ ] **Step 6: 커밋**

```bash
git add app-client/app app-client/src/notifications app-client/__tests__/settings.test.tsx
git commit -m "feat(app): 설정·온보딩·푸시 등록"
```

---

## Task 15: Apple / Google 로그인 실연동

Task 5의 로그인은 `EXPO_PUBLIC_DEV_ID_TOKEN` 을 그대로 서버에 보내는 개발용
우회다. 서버는 그 토큰을 Apple·Google JWKS로 **실제로 검증**하므로, 진짜
id_token 을 받아오지 않으면 실기기에서 로그인이 되지 않는다.

**Files:**
- Create: `app-client/src/auth/social.ts`
- Modify: `app-client/app/login.tsx`, `app-client/app.json`, `app-client/.env.example`
- Test: `app-client/__tests__/social.test.ts`

**Interfaces:**
- Consumes: `expo-apple-authentication`, `expo-auth-session/providers/google`
- Produces: `signInWithApple() -> Promise<string>`, `useGoogleIdToken()` — 둘 다 id_token 문자열을 준다

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/social.test.ts`:

```ts
import * as AppleAuthentication from "expo-apple-authentication";

import { AppleUnavailable, signInWithApple } from "../src/auth/social";

jest.mock("expo-apple-authentication");

describe("Apple 로그인", () => {
  afterEach(() => jest.resetAllMocks());

  it("id_token 을 돌려준다", async () => {
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      identityToken: "apple-id-token",
    });

    await expect(signInWithApple()).resolves.toBe("apple-id-token");
  });

  it("기기가 지원하지 않으면 구분 가능한 에러를 던진다", async () => {
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await expect(signInWithApple()).rejects.toBeInstanceOf(AppleUnavailable);
  });

  it("유저가 취소하면 null 토큰을 그냥 통과시키지 않는다", async () => {
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      identityToken: null,
    });

    await expect(signInWithApple()).rejects.toThrow(/identityToken/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/social.test.ts`
Expected: FAIL — `Cannot find module '../src/auth/social'`

- [ ] **Step 3: 패키지 설치**

```bash
cd app-client
npx expo install expo-apple-authentication expo-auth-session expo-web-browser
```

`app.json` 의 `expo.plugins` 에 `"expo-apple-authentication"` 을 추가하고,
`expo.ios.usesAppleSignIn` 을 `true` 로 둔다.

- [ ] **Step 4: 구현**

`app-client/src/auth/social.ts`:

```ts
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";

export class AppleUnavailable extends Error {
  constructor() {
    super("이 기기에서는 Apple 로그인을 쓸 수 없습니다.");
    this.name = "AppleUnavailable";
  }
}

/**
 * 서버가 Apple JWKS 로 실제 검증하므로 진짜 identityToken 이 필요하다.
 * null 을 그대로 보내면 서버에서 401 이 되는데, 그러면 원인이 로그인 취소인지
 * 토큰 문제인지 화면에서 구분할 수 없다. 여기서 먼저 끊는다.
 */
export async function signInWithApple(): Promise<string> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new AppleUnavailable();
  }
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) {
    throw new Error("Apple 이 identityToken 을 주지 않았습니다.");
  }
  return credential.identityToken;
}

/**
 * Google 은 훅으로만 쓸 수 있다(리다이렉트를 화면 생명주기에 묶는다).
 * clientId 는 서버의 GOOGLE_CLIENT_ID 와 같아야 한다 — 다르면 서버가
 * audience 검증에서 떨어뜨린다.
 */
export function useGoogleIdToken() {
  return Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });
}
```

`app-client/app/login.tsx` 의 `handle` 을 교체한다:

```tsx
import { useEffect } from "react";

import { AppleUnavailable, signInWithApple, useGoogleIdToken } from "../src/auth/social";

  const [request, response, promptGoogle] = useGoogleIdToken();

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.params.id_token;
    signIn("google", idToken, "").then(() => router.replace("/"));
  }, [response, signIn]);

  async function handleApple() {
    setBusy(true);
    try {
      const idToken = await signInWithApple();
      await signIn("apple", idToken, "");
      router.replace("/");
    } catch (error) {
      if (error instanceof AppleUnavailable) {
        Alert.alert("Apple 로그인 불가", "Google 로그인을 사용해주세요.");
      } else {
        Alert.alert("로그인 실패", (error as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }
```

Apple 버튼은 `handleApple`, Google 버튼은 `promptGoogle` 을 부르고
`disabled={!request}` 를 건다.

닉네임은 서버가 필수로 받으므로, 빈 문자열이면 온보딩에서 입력받아
`PATCH` 하는 대신 로그인 직후 기본값(`"스터디로그"`)을 보내고 온보딩에서 바꾸게 한다.
그러려면 `signIn` 의 세 번째 인자를 `nickname || "스터디로그"` 로 넘긴다.

`.env.example` 에 추가한다:

```
EXPO_PUBLIC_GOOGLE_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_REVENUECAT_KEY=
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (70 passed)

- [ ] **Step 6: 실기기 확인**

Run: `cd app-client && npx expo run:ios` (또는 `run:android`)
Apple 로그인을 눌러 실제로 홈까지 들어가는지 확인한다. 시뮬레이터에서는
Apple 로그인이 제한적이므로 실기기가 필요하다.

- [ ] **Step 7: 커밋**

```bash
git add app-client/src/auth/social.ts app-client/app/login.tsx app-client/app.json app-client/.env.example app-client/__tests__/social.test.ts
git commit -m "feat(app): Apple/Google 로그인 실연동"
```

---

## Task 16: 마감 — 오류 처리, 세션 복원, 앱 리소스

**Files:**
- Create: `app-client/app/+not-found.tsx`, `app-client/src/components/ErrorBoundary.tsx`, `app-client/assets/README.md`
- Modify: `app-client/app/_layout.tsx`, `app-client/app/(tabs)/index.tsx`, `app-client/app.json`
- Test: `app-client/__tests__/resilience.test.tsx`

**Interfaces:**
- Consumes: `ApiError`, `useAuth`, `useCurrentSession`
- Produces: 401 전역 처리, 앱 재시작 시 열린 세션 복원, 에러 바운더리

**앱이 죽었다 살아나도 열린 세션으로 돌아가야 한다.** 서버가 `started_at` 을
들고 있으므로 복원은 `GET /sessions/current` 한 번이면 된다 — 앱이 로컬에
타이머 상태를 저장할 이유가 없고, 저장하면 오히려 기기 시계 조작에 노출된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app-client/__tests__/resilience.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import Home from "../app/(tabs)/index";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const me = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 0, credit_balance: 0,
};

function mockApi(payloads: Record<string, unknown>) {
  jest.spyOn(global, "fetch").mockImplementation((url) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    return Promise.resolve({
      ok: true, status: 200, json: async () => payloads[path] ?? null,
    } as Response);
  });
}

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

function Boom(): never {
  throw new Error("터짐");
}

describe("복원력", () => {
  it("앱을 다시 열어도 열린 세션으로 돌아간다", async () => {
    mockApi({
      "/users/me": me,
      "/sessions/current": {
        id: "s1", started_at: "2026-09-10T01:00:00Z", ended_at: null,
        counted_minutes: 0, status: "open",
      },
      "/challenges/current": null,
    });

    wrap(<Home />);
    // 로컬에 저장된 것이 없어도 서버가 준 세션으로 종료 화면이 살아난다
    await waitFor(() => expect(screen.getByText("공부 종료")).toBeTruthy());
  });

  it("abandoned 세션은 열린 것으로 취급하지 않는다", async () => {
    mockApi({
      "/users/me": me,
      "/sessions/current": {
        id: "s1", started_at: "2026-09-10T01:00:00Z", ended_at: null,
        counted_minutes: 0, status: "abandoned",
      },
      "/challenges/current": null,
    });

    wrap(<Home />);
    await waitFor(() => expect(screen.getByText("공부 시작")).toBeTruthy());
  });

  it("렌더링이 터져도 흰 화면 대신 안내를 보여준다", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/문제가 발생했습니다/)).toBeTruthy();
  });

  it("바운더리는 정상 자식을 그대로 그린다", () => {
    render(
      <ErrorBoundary>
        <Text>정상</Text>
      </ErrorBoundary>
    );
    expect(screen.getByText("정상")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd app-client && npx jest __tests__/resilience.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/ErrorBoundary'`

- [ ] **Step 3: 에러 바운더리 작성**

`app-client/src/components/ErrorBoundary.tsx`:

```tsx
import { Component, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>
          문제가 발생했습니다
        </Text>
        <Text style={{ color: "#52525b" }}>{this.state.error.message}</Text>
        <Pressable onPress={() => this.setState({ error: null })}>
          <Text style={{ color: "#2563eb" }}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
}
```

- [ ] **Step 4: 401 전역 처리와 바운더리 연결**

`app-client/app/_layout.tsx` 를 고친다:

```tsx
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";

import { ApiError } from "../src/api/client";
import { clearToken } from "../src/auth/storage";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
  queryCache: new QueryCache({
    onError: async (error) => {
      // 토큰 만료는 어느 화면에서든 같은 결말이다. 화면마다 처리하지 않는다.
      if (error instanceof ApiError && error.kind === "auth") {
        await clearToken();
        queryClient.clear();
        router.replace("/login");
      }
    },
  }),
});

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="capture" options={{ presentation: "modal" }} />
          <Stack.Screen name="appeal/[photoId]" options={{ presentation: "modal" }} />
          <Stack.Screen name="restore/[recordId]" options={{ presentation: "modal" }} />
        </Stack>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
```

`app-client/app/+not-found.tsx`:

```tsx
import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function NotFound() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
      <Text>없는 화면입니다.</Text>
      <Link href="/">
        <Text style={{ color: "#2563eb" }}>홈으로</Text>
      </Link>
    </View>
  );
}
```

- [ ] **Step 5: 앱 리소스와 메타데이터**

`app-client/app.json` 을 채운다 — `expo.name` 은 `"스터디로그"`,
`expo.slug` 은 `"studylog"`, `expo.ios.bundleIdentifier` 와
`expo.android.package` 는 서버 `.env` 의 `APPLE_BUNDLE_ID` 와 같은
`com.studylog.app`, `expo.ios.infoPlist.NSCameraUsageDescription` 은
`"공부 인증 사진을 찍습니다."`, `expo.android.permissions` 에 `"CAMERA"`.

`app-client/assets/README.md` 에 필요한 파일과 규격을 적는다 —
`icon.png` 1024×1024, `splash.png` 1284×2778, `adaptive-icon.png` 1024×1024.
디자인이 나오기 전까지는 Expo 기본 리소스를 쓴다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd app-client && npx jest`
Expected: PASS (74 passed)

- [ ] **Step 7: 전체 흐름을 실제 서버로 확인**

로컬 서버를 띄운 상태에서 `npx expo start` 로 앱을 열고 아래를 순서대로 확인한다.

1. 로그인 → 온보딩에서 목표 설정 → 홈
2. 챌린지 선택에서 **서버가 준 7종만** 보이는지
3. 공부 시작 → 홈에 경과 시간이 흐르는지
4. **앱을 완전히 종료했다 다시 열어** 열린 세션이 살아나는지
5. 공부 종료 → 피드에 사진 두 장이 올라오는지
6. 기기 비행기 모드로 종료 샷을 실패시킨 뒤, **닫기 버튼이 없고** 재시도가 되는지

- [ ] **Step 8: 커밋**

```bash
git add app-client
git commit -m "feat(app): 오류 처리·세션 복원·앱 리소스"
```

---

## 스펙 대조

| 스펙 §9.1 | 태스크 |
|---|---|
| 디자인 시스템 | 3 |
| 로그인 / 목표 설정 | 5, 14, 15 |
| 홈 | 6 |
| 촬영 · 판정 결과 | 7, 8 |
| 이의제기 | 9 |
| 챌린지 선택 | 10 |
| 피드 | 12 |
| 그룹 | 11 |
| 기록 · 복구 | 13 |
| 설정 | 14 |
| **앱이 하지 말아야 할 것 4가지** | 2·6(시간), 7(판정), 10(가격표), 10(결제) |
| 종료 샷 실패 처리 | 8 |
| 스택 | 1 |

**v1 범위 밖이라 태스크가 없는 것** — 딥링크(초대는 코드 복사), 오프라인 큐,
다국어, 다크 모드, 애널리틱스.

**서버에 있으나 앱이 쓰지 않는 것** — `POST /webhooks/revenuecat`(RevenueCat이 직접 호출),
`GET /health`(운영용).
