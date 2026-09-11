import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";

import { useMe, useSetGoal } from "../../src/api/hooks";
import { useAuth } from "../../src/auth/useAuth";
import { GOAL_MAX_MINUTES, GOAL_MIN_MINUTES } from "../../src/config";
import { Amount } from "../../src/design/Amount";
import { Button } from "../../src/design/Button";
import { T } from "../../src/design/Text";
import { color, radius, space, type } from "../../src/design/tokens";
import { registerPushToken } from "../../src/notifications/register";

export default function Settings() {
  const me = useMe();
  const setGoal = useSetGoal();
  const { signOut } = useAuth();
  const [minutes, setMinutes] = useState("");

  useEffect(() => {
    if (me.data && minutes === "") setMinutes(String(me.data.daily_goal_minutes));
  }, [me.data, minutes]);

  function save() {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < GOAL_MIN_MINUTES || value > GOAL_MAX_MINUTES) return;
    setGoal.mutate(value);
  }

  // PATCH 응답이 그대로 me 캐시에 들어가므로(useSetGoal.onSuccess), 여기서는
  // 항상 서버가 마지막으로 알려준 값만 본다 — 낙관적으로 새 값을 활성 목표인
  // 것처럼 보여주지 않는다.
  const pending = me.data?.pending_goal_minutes;

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, paddingTop: space.huge, gap: space.xl }}
    >
      <T variant="title">설정</T>

      <View style={{ gap: space.sm }}>
        <T variant="section">하루 목표 (분)</T>
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
        <Button label="목표 저장" tone="primary" onPress={save} />
        {pending != null && (
          // 서버가 목표 변경을 다음 04:00 정산 이후에만 반영한다. 밤에 목표를
          // 낮춰 페이백을 타는 것을 막기 위한 규칙이라, 화면이 이유를 말해줘야
          // 유저가 이걸 버그로 신고하지 않는다.
          <T variant="caption" kind="muted">
            내일부터 {pending}분이 적용됩니다. 오늘 목표는 그대로입니다.
          </T>
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <T variant="section">크레딧</T>
        <Amount value={me.data?.credit_balance ?? 0} />
        <T variant="caption" kind="muted">
          크레딧은 현금으로 환급되거나 다른 사람에게 양도될 수 없으며, 챌린지
          참가와 스트릭 복구에만 쓸 수 있습니다.
        </T>
      </View>

      <Button
        label="알림 다시 설정"
        tone="secondary"
        onPress={() => {
          registerPushToken();
        }}
      />

      <Button label="그룹 관리" tone="secondary" onPress={() => router.push("/groups")} />

      <Button
        label="로그아웃"
        tone="text"
        kind="negative"
        onPress={async () => {
          await signOut();
          router.replace("/login");
        }}
      />
    </ScrollView>
  );
}
