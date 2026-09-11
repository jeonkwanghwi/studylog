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

const ONBOARDED_PREFIX = "studylog.onboarded.";

// GET /users/me 에는 "온보딩을 마쳤는지"를 알려주는 필드가 없다.
// daily_goal_minutes/streak_count로 유추하려 하면, 이미 온보딩한 유저가
// 목표를 기본값(60분)으로 남겨둔 채 하루를 놓쳐 streak_count가 0으로
// 리셋될 때(정산 로직상 흔한 일) 다시 온보딩으로 보내버리는 오탐이 생긴다.
// 그래서 유저 id로 구분한 로컬 플래그로만 판단한다.
export async function markOnboarded(userId: string): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDED_PREFIX + userId, "1");
}

export async function hasOnboarded(userId: string): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDED_PREFIX + userId)) === "1";
}
