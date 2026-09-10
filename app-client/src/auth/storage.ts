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
