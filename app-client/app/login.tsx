import { router } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";

import { useAuth } from "../src/auth/useAuth";
import { Button } from "../src/design/Button";
import { T } from "../src/design/Text";
import { space } from "../src/design/tokens";

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
    <View
      style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.md }}
    >
      <T variant="hero" style={{ marginBottom: space.xl }}>
        스터디로그
      </T>
      <Button
        label="Apple로 계속하기"
        tone="primary"
        disabled={busy}
        onPress={() => handle("apple")}
      />
      <Button
        label="Google로 계속하기"
        tone="secondary"
        disabled={busy}
        onPress={() => handle("google")}
      />
    </View>
  );
}
