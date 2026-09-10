# StudyLog 앱 (Expo) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완성된 StudyLog 서버 API 위에 올라가는 Expo(React Native) 앱을 만든다 — 사진으로 공부를 인증하고, 챌린지에 돈을 걸고, 매일 크레딧으로 돌려받는 화면 전부.

**Architecture:** Expo Router의 파일 기반 라우팅으로 4개 탭(홈·피드·기록·설정)과 3개 모달(촬영·이의제기·복구)을 구성한다. 서버 상태는 전부 TanStack Query가 들고, 전역 상태 관리자는 두지 않는다 — 이 앱이 다루는 상태는 사실상 전부 서버 상태다. 토큰만 expo-secure-store에 남는다. 시간·판정·가격은 앱이 계산하지 않고 서버가 준 값을 표시만 한다.

**Tech Stack:** Expo SDK 52 / TypeScript / Expo Router / TanStack Query v5 / expo-camera / expo-secure-store / expo-notifications / react-native-purchases (RevenueCat) / Jest + React Native Testing Library / MSW (API 모킹)

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

## Task 3: API 클라이언트와 타입

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

## Task 4: 인증 게이트와 로그인

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

## Task 5: 탭 레이아웃과 홈

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
