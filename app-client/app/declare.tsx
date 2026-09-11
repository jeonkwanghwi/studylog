import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";

import { Button } from "../src/design/Button";
import { T } from "../src/design/Text";
import { Touchable } from "../src/design/Touchable";
import { color, radius, space, type } from "../src/design/tokens";

// 판정은 "공부 사진인가"가 아니라 "선언한 것과 사진이 맞는가"로 이뤄진다.
// 그래서 카메라보다 이 화면이 먼저 온다 — 선언 없이는 판정 기준이 없다.
const MAX = 100;

const SUGGESTIONS = ["공부", "책읽기", "운동"];

export default function Declare() {
  const [activity, setActivity] = useState("");
  const value = activity.trim();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, padding: space.xl, paddingTop: space.huge, gap: space.lg }}
    >
      <T variant="title">오늘 뭐 할 건가요?</T>
      <T variant="body" kind="sub">
        적은 내용과 사진이 맞는지로 인증합니다. 구체적으로 적을수록 정확해요.
      </T>

      <TextInput
        value={activity}
        onChangeText={setActivity}
        maxLength={MAX}
        autoFocus
        returnKeyType="done"
        placeholder="예: 수학 문제집, 러닝머신 30분"
        placeholderTextColor={color.textMuted}
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

      <View style={{ flexDirection: "row", gap: space.sm }}>
        {SUGGESTIONS.map((s) => (
          <Touchable
            key={s}
            accessibilityRole="button"
            onPress={() => setActivity(s)}
            style={{
              // 44pt — 그 아래로는 손가락이 자주 빗나간다.
              minHeight: 44,
              justifyContent: "center",
              paddingHorizontal: space.base,
              borderRadius: radius.pill,
              backgroundColor: color.fill,
            }}
          >
            <T variant="caption" kind="sub">
              {s}
            </T>
          </Touchable>
        ))}
      </View>

      <Button
        label="카메라 열기"
        tone="primary"
        disabled={!value}
        onPress={() =>
          router.replace({ pathname: "/capture", params: { kind: "start", activity: value } })
        }
      />
    </KeyboardAvoidingView>
  );
}
