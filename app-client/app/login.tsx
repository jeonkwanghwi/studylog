import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";

import {
  AppleCanceled,
  AppleUnavailable,
  signInWithApple,
  useGoogleIdToken,
  useKakaoIdToken,
} from "../src/auth/social";
import { useAuth } from "../src/auth/useAuth";
import { Button } from "../src/design/Button";
import { T } from "../src/design/Text";
import { space } from "../src/design/tokens";

// 서버가 닉네임을 필수로 받지만, 소셜 로그인은 신뢰할 만한 닉네임을 주지 않는다.
// 로그인 직후에는 기본값을 보내고, 실제 이름은 온보딩에서 받는다.
const DEFAULT_NICKNAME = "스터디로그";

export default function Login() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const { request: kakaoRequest, promptAsync: promptKakao, idToken: kakaoIdToken } =
    useKakaoIdToken();
  const { request: googleRequest, promptAsync: promptGoogle, idToken: googleIdToken } =
    useGoogleIdToken();

  useEffect(() => {
    if (!kakaoIdToken) return;
    signIn("kakao", kakaoIdToken, DEFAULT_NICKNAME)
      .then(() => router.replace("/"))
      .catch((error) => Alert.alert("로그인 실패", (error as Error).message));
  }, [kakaoIdToken, signIn]);

  useEffect(() => {
    if (!googleIdToken) return;
    signIn("google", googleIdToken, DEFAULT_NICKNAME)
      .then(() => router.replace("/"))
      .catch((error) => Alert.alert("로그인 실패", (error as Error).message));
  }, [googleIdToken, signIn]);

  async function handleApple() {
    setBusy(true);
    try {
      const idToken = await signInWithApple();
      await signIn("apple", idToken, DEFAULT_NICKNAME);
      router.replace("/");
    } catch (error) {
      if (error instanceof AppleCanceled) {
        // 취소는 사용자의 정상적인 선택이다 — 아무것도 보여주지 않는다.
      } else if (error instanceof AppleUnavailable) {
        Alert.alert("Apple 로그인 불가", "카카오 로그인을 사용해주세요.");
      } else {
        Alert.alert("로그인 실패", (error as Error).message);
      }
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
        label="카카오로 계속하기"
        tone="primary"
        disabled={busy || !kakaoRequest}
        onPress={() => promptKakao()}
      />
      <Button
        label="Apple로 계속하기"
        tone="secondary"
        disabled={busy}
        onPress={handleApple}
      />
      <Button
        label="Google로 계속하기"
        tone="secondary"
        disabled={busy || !googleRequest}
        onPress={() => promptGoogle()}
      />
    </View>
  );
}
