import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, TextInput, View } from "react-native";

import { useMe, useSetGoal, useSetNickname } from "../src/api/hooks";
import { markOnboarded } from "../src/auth/storage";
import { GOAL_MAX_MINUTES, GOAL_MIN_MINUTES } from "../src/config";
import { Button } from "../src/design/Button";
import { T } from "../src/design/Text";
import { color, radius, space, type } from "../src/design/tokens";
import { registerPushToken } from "../src/notifications/register";

const NICKNAME_MAX = 32;

const inputStyle = {
  backgroundColor: color.fill,
  borderRadius: radius.button,
  padding: space.base,
  color: color.text,
  fontFamily: type.body.fontFamily,
  fontSize: type.body.fontSize,
  letterSpacing: type.body.letterSpacing,
};

export default function Onboarding() {
  const me = useMe();
  const setNickname = useSetNickname();
  const setGoal = useSetGoal();
  const queryClient = useQueryClient();
  const [nickname, setNicknameText] = useState("");
  const [minutes, setMinutes] = useState("60");

  const saving = setNickname.isPending || setGoal.isPending;

  async function save() {
    const name = nickname.trim();
    // 조용히 return 하면 버튼이 고장난 것처럼 보인다. 앱 첫 화면에서
    // 그러면 유저는 여기서 그냥 나간다.
    if (!name) {
      Alert.alert("이름을 입력해주세요", "그룹 피드에서 친구들에게 보이는 이름이에요.");
      return;
    }

    const value = Number(minutes);
    if (!Number.isInteger(value) || value < GOAL_MIN_MINUTES || value > GOAL_MAX_MINUTES) {
      Alert.alert("목표를 확인해주세요", `${GOAL_MIN_MINUTES}~${GOAL_MAX_MINUTES}분 사이로 입력해주세요.`);
      return;
    }

    try {
      // 이름을 먼저 저장한다. 목표만 저장되고 이름이 실패하면 소셜 로그인이
      // 넣어둔 기본 이름("스터디로그")으로 피드에 올라간다.
      await setNickname.mutateAsync(name);
      await setGoal.mutateAsync(value);
    } catch {
      Alert.alert("저장하지 못했습니다", "연결을 확인하고 다시 시도해주세요.");
      return;
    }

    if (me.data) {
      await markOnboarded(me.data.id);
      queryClient.setQueryData(["onboarded", me.data.id], true);
    }
    await registerPushToken();
    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.xl }}
    >
      <T variant="hero">시작하기 전에</T>

      <View style={{ gap: space.sm }}>
        <T variant="section">뭐라고 부를까요?</T>
        <T variant="body" kind="sub">
          그룹 피드에서 친구들에게 보이는 이름이에요.
        </T>
        <TextInput
          value={nickname}
          onChangeText={setNicknameText}
          maxLength={NICKNAME_MAX}
          autoFocus
          placeholder="이름 또는 별명"
          placeholderTextColor={color.textMuted}
          style={inputStyle}
        />
      </View>

      <View style={{ gap: space.sm }}>
        <T variant="section">하루 목표는 몇 분?</T>
        <T variant="body" kind="sub">
          매일 이만큼 공부하면 그날 몫을 돌려받아요. 나중에 설정에서 언제든 바꿀 수
          있어요.
        </T>
        <TextInput
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          style={inputStyle}
        />
      </View>

      <Button label="시작하기" tone="primary" loading={saving} onPress={save} />
    </KeyboardAvoidingView>
  );
}
