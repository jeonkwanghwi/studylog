import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";

import { ApiError, api } from "../../src/api/client";
import { useInvalidateAll } from "../../src/api/hooks";
import type { JudgeResultOut } from "../../src/api/types";
import { Button } from "../../src/design/Button";
import { T } from "../../src/design/Text";
import { color, radius, space, type } from "../../src/design/tokens";

type Phase =
  | { name: "writing" }
  | { name: "sending" }
  | { name: "judged"; result: JudgeResultOut }
  | { name: "refused"; detail: string };

export default function Appeal() {
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "writing" });
  const invalidate = useInvalidateAll();

  async function send() {
    if (!text.trim()) return;
    setPhase({ name: "sending" });
    try {
      const result = await api.post<JudgeResultOut>(`/photos/${photoId}/appeal`, {
        text: text.trim(),
      });
      await invalidate();
      setPhase({ name: "judged", result });
    } catch (error) {
      const detail =
        error instanceof ApiError && error.kind === "conflict"
          ? error.detail
          : "요청을 보내지 못했습니다. 잠시 후 다시 시도해주세요.";
      setPhase({ name: "refused", detail });
    }
  }

  if (phase.name === "judged") {
    const passed = phase.result.result === "pass";
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
        <T variant="title">{passed ? "인정됐습니다" : "다시 거절됐습니다"}</T>
        <T variant="body" kind="sub">
          {phase.result.reason}
        </T>
        {!passed && (
          <T variant="caption" kind="muted">
            이 사진에 대한 판정은 최종입니다.
          </T>
        )}
        <Button
          label="확인"
          tone={passed ? "primary" : "text"}
          onPress={() => router.back()}
        />
      </View>
    );
  }

  if (phase.name === "refused") {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
        <T variant="title">이의제기를 처리하지 못했습니다</T>
        <T variant="body" kind="sub">
          {phase.detail}
        </T>
        <Button label="닫기" tone="text" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: space.xl, paddingTop: space.huge, gap: space.lg }}>
      <T variant="title">이의제기</T>
      <T variant="body" kind="sub">
        사진에서 무엇을 하고 있었는지 적어주세요. 이 설명을 참고해 한 번만 다시 판정합니다.
      </T>
      <TextInput
        value={text}
        onChangeText={setText}
        editable={phase.name !== "sending"}
        multiline
        placeholder="예: 무엇을 하고 있었는지 적어주세요 (태블릿 인강 등)"
        placeholderTextColor={color.textMuted}
        style={{
          backgroundColor: color.fill,
          borderRadius: radius.button,
          padding: space.base,
          minHeight: 120,
          textAlignVertical: "top",
          color: color.text,
          fontFamily: type.body.fontFamily,
          fontSize: type.body.fontSize,
          letterSpacing: type.body.letterSpacing,
        }}
      />
      {phase.name === "sending" ? (
        <ActivityIndicator color={color.accent} />
      ) : (
        <Button
          label="다시 판정 요청"
          tone="primary"
          disabled={!text.trim()}
          onPress={send}
        />
      )}
    </View>
  );
}
