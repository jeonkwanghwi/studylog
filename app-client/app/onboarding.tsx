import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, TextInput } from "react-native";

import { useMe, useSetGoal } from "../src/api/hooks";
import { markOnboarded } from "../src/auth/storage";
import { GOAL_MAX_MINUTES, GOAL_MIN_MINUTES } from "../src/config";
import { Button } from "../src/design/Button";
import { T } from "../src/design/Text";
import { color, radius, space, type } from "../src/design/tokens";
import { registerPushToken } from "../src/notifications/register";

export default function Onboarding() {
  const me = useMe();
  const setGoal = useSetGoal();
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState("60");

  async function save() {
    const value = Number(minutes);
    // 조용히 return 하면 버튼이 고장난 것처럼 보인다. 앱 첫 화면에서
    // 그러면 유저는 여기서 그냥 나간다.
    if (!Number.isInteger(value) || value < GOAL_MIN_MINUTES || value > GOAL_MAX_MINUTES) {
      Alert.alert("목표를 확인해주세요", `${GOAL_MIN_MINUTES}~${GOAL_MAX_MINUTES}분 사이로 입력해주세요.`);
      return;
    }

    try {
      await setGoal.mutateAsync(value);
    } catch {
      Alert.alert("목표를 저장하지 못했습니다", "연결을 확인하고 다시 시도해주세요.");
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
      style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}
    >
      <T variant="hero">하루 목표를 정해주세요</T>
      <T variant="body" kind="sub">
        매일 이만큼 공부하면 그날 몫을 돌려받아요. 나중에 설정에서 언제든 바꿀 수
        있어요.
      </T>
      <TextInput
        value={minutes}
        onChangeText={setMinutes}
        keyboardType="number-pad"
        style={{
          backgroundColor: color.fill,
          borderRadius: radius.button,
          padding: space.base,
          color: color.text,
          fontFamily: type.body.fontFamily,
          fontSize: type.body.fontSize,
          letterSpacing: type.body.letterSpacing,
        }}
      />
      <Button
        label="시작하기"
        tone="primary"
        loading={setGoal.isPending}
        onPress={save}
      />
    </KeyboardAvoidingView>
  );
}
