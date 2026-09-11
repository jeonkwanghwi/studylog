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
