import * as AppleAuthentication from "expo-apple-authentication";
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
import { SocialButton } from "../src/design/SocialButton";
import { T } from "../src/design/Text";
import { color, radius, space } from "../src/design/tokens";

// 서버가 닉네임을 필수로 받지만, 소셜 로그인은 신뢰할 만한 닉네임을 주지 않는다.
// 로그인 직후에는 기본값을 보내고, 실제 이름은 온보딩에서 받는다.
const DEFAULT_NICKNAME = "스터디로그";

type Provider = "apple" | "google" | "kakao";

export default function Login() {
  const { signIn } = useAuth();
  // 어느 제공자로 진행 중인지까지 들고 있어야 그 버튼에만 스피너를 띄우고
  // 나머지를 잠글 수 있다. 브라우저에 다녀온 뒤 토큰을 교환하는 동안
  // 화면이 아무 말도 안 하면 유저는 버튼을 다시 누른다.
  const [busy, setBusy] = useState<Provider | null>(null);
  const { request: kakaoRequest, promptAsync: promptKakao, idToken: kakaoIdToken } =
    useKakaoIdToken();
  const { request: googleRequest, promptAsync: promptGoogle, idToken: googleIdToken } =
    useGoogleIdToken();

  function fail(error: unknown) {
    setBusy(null);
    Alert.alert(
      "로그인하지 못했습니다",
      error instanceof Error && error.message
        ? error.message
        : "연결을 확인하고 다시 시도해주세요."
    );
  }

  useEffect(() => {
    if (!kakaoIdToken) return;
    setBusy("kakao");
    signIn("kakao", kakaoIdToken, DEFAULT_NICKNAME)
      .then(() => router.replace("/"))
      .catch(fail);
  }, [kakaoIdToken, signIn]);

  useEffect(() => {
    if (!googleIdToken) return;
    setBusy("google");
    signIn("google", googleIdToken, DEFAULT_NICKNAME)
      .then(() => router.replace("/"))
      .catch(fail);
  }, [googleIdToken, signIn]);

  async function handleApple() {
    setBusy("apple");
    try {
      const idToken = await signInWithApple();
      await signIn("apple", idToken, DEFAULT_NICKNAME);
      router.replace("/");
    } catch (error) {
      if (error instanceof AppleCanceled) {
        // 취소는 사용자의 정상적인 선택이다 — 아무것도 보여주지 않는다.
        setBusy(null);
      } else if (error instanceof AppleUnavailable) {
        setBusy(null);
        Alert.alert("Apple 로그인 불가", "카카오 로그인을 사용해주세요.");
      } else {
        fail(error);
      }
    }
  }

  const locked = busy !== null;

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.md }}>
      <View style={{ marginBottom: space.xxl, gap: space.sm }}>
        <T variant="hero">스터디로그</T>
        <T variant="body" kind="sub">
          돈을 걸고 공부합니다. 목표를 채운 날마다 하루치를 돌려받아요.
        </T>
      </View>

      <SocialButton
        brand="kakao"
        loading={busy === "kakao"}
        disabled={locked || !kakaoRequest}
        onPress={() => promptKakao()}
      />

      {/* Apple 은 자사 버튼 컴포넌트를 쓰지 않으면 심사에서 반려된다.
          커스텀 버튼으로 흉내내면 안 된다. */}
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radius.button}
        style={{ height: 56, opacity: locked ? 0.4 : 1 }}
        onPress={() => {
          if (!locked) handleApple();
        }}
      />

      <SocialButton
        brand="google"
        loading={busy === "google"}
        disabled={locked || !googleRequest}
        onPress={() => promptGoogle()}
      />

      <T variant="caption" kind="muted" style={{ textAlign: "center", marginTop: space.base }}>
        계속하면 이용약관과 개인정보처리방침에 동의하는 것으로 봅니다.
      </T>
    </View>
  );
}
