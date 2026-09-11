import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";

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
    if (!Number.isInteger(value) || value < GOAL_MIN_MINUTES || value > GOAL_MAX_MINUTES) return;

    await setGoal.mutateAsync(value);

    if (me.data) {
      await markOnboarded(me.data.id);
      queryClient.setQueryData(["onboarded", me.data.id], true);
    }
    await registerPushToken();
    router.replace("/(tabs)");
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
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
      <Button label="시작하기" tone="primary" onPress={save} />
    </View>
  );
}
