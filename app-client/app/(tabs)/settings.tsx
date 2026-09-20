import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, TextInput, View } from "react-native";

import { ApiError } from "../../src/api/client";
import { useMe, useSetGoal } from "../../src/api/hooks";
import { useAuth } from "../../src/auth/useAuth";
import { GOAL_MAX_MINUTES, GOAL_MIN_MINUTES } from "../../src/config";
import { Amount } from "../../src/design/Amount";
import { Button } from "../../src/design/Button";
import { Field } from "../../src/design/Field";
import { useScreenPadding } from "../../src/design/safeArea";
import { ScreenTitle } from "../../src/design/ScreenTitle";
import { T } from "../../src/design/Text";
import { Toast, useToast } from "../../src/design/Toast";
import { color, radius, space, type } from "../../src/design/tokens";
import { registerPushToken } from "../../src/notifications/register";

export default function Settings() {
  const screenPadding = useScreenPadding();
  const toast = useToast();
  const me = useMe();
  const setGoal = useSetGoal();
  const { signOut } = useAuth();
  const [minutes, setMinutes] = useState("");

  useEffect(() => {
    if (me.data && minutes === "") setMinutes(String(me.data.daily_goal_minutes));
  }, [me.data, minutes]);

  function save() {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < GOAL_MIN_MINUTES || value > GOAL_MAX_MINUTES) {
      Alert.alert(
        "목표 저장 실패",
        `${GOAL_MIN_MINUTES}~${GOAL_MAX_MINUTES}분 사이로 입력해주세요.`
      );
      return;
    }
    setGoal.mutate(value, {
      onSuccess: () => toast.show("목표를 저장했어요"),
      onError: (error) => {
        Alert.alert(
          "목표 저장 실패",
          error instanceof ApiError ? error.detail : "잠시 후 다시 시도해주세요."
        );
      },
    });
  }

  // PATCH 응답이 그대로 me 캐시에 들어가므로(useSetGoal.onSuccess), 여기서는
  // 항상 서버가 마지막으로 알려준 값만 본다 — 낙관적으로 새 값을 활성 목표인
  // 것처럼 보여주지 않는다.
  const pending = me.data?.pending_goal_minutes;

  return (
    <>
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.xl, ...screenPadding }}
    >
      <ScreenTitle title="설정" />

      <View style={{ gap: space.base }}>
        {/* 이 숫자를 바꿀 수 있다는 것을 아무도 몰랐다. 칸에 경계를 주고,
            화면을 대표하는 숫자니까 크게 보여준다. */}
        <Field
          label="하루 목표"
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          suffix="분"
          big
          hint={
            pending != null
              ? // 서버가 목표 변경을 다음 04:00 정산 이후에만 반영한다. 밤에
                // 목표를 낮춰 페이백을 타는 것을 막는 규칙이라, 화면이 이유를
                // 말해줘야 유저가 이걸 버그로 신고하지 않는다.
                `내일부터 ${pending}분이 적용됩니다. 오늘 목표는 그대로입니다.`
              : undefined
          }
        />
        <Button
          label="목표 저장"
          tone="primary"
          loading={setGoal.isPending}
          onPress={save}
        />
      </View>

      <View style={{ gap: space.sm }}>
        <T variant="caption" kind="muted">
          크레딧
        </T>
        <Amount value={me.data?.credit_balance ?? 0} size="hero" />
        <T variant="caption" kind="muted">
          크레딧은 현금으로 환급되거나 다른 사람에게 양도될 수 없으며, 챌린지
          참가와 스트릭 복구에만 쓸 수 있습니다.
        </T>
      </View>

      <Button
        label="알림 다시 설정"
        tone="secondary"
        onPress={async () => {
          const granted = await registerPushToken();
          Alert.alert(
            granted ? "알림 설정됨" : "알림을 설정하지 못했습니다",
            granted
              ? "이제부터 알림을 받을 수 있습니다."
              : "기기 설정에서 알림 권한을 허용해주세요."
          );
        }}
      />

      <Button label="그룹 관리" tone="secondary" onPress={() => router.push("/groups")} />

      <View style={{ gap: space.sm }}>
        <T variant="section">약관</T>
        {/* 가입 후에는 로그인 화면을 다시 볼 수 없다. 여기서도 닿아야 한다. */}
        <Button label="이용약관" tone="text" onPress={() => router.push("/legal/terms")} />
        <Button
          label="개인정보처리방침"
          tone="text"
          onPress={() => router.push("/legal/privacy")}
        />
      </View>

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
    <Toast message={toast.message} onHide={toast.hide} />
    </>
  );
}
