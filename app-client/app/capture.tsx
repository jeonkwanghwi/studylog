import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { useInvalidateAll } from "../src/api/hooks";
import type { JudgeResultOut } from "../src/api/types";
import { uploadPhoto, type ShotKind } from "../src/api/upload";
import { Button } from "../src/design/Button";
import { T } from "../src/design/Text";
import { color, radius, space } from "../src/design/tokens";

type Phase =
  | { name: "ready" }
  | { name: "uploading" }
  | { name: "judged"; result: JudgeResultOut }
  | { name: "error"; message: string };

const SHUTTER_SIZE = 76;

export default function Capture() {
  const { kind, sessionId } = useLocalSearchParams<{
    kind: ShotKind;
    sessionId?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ name: "ready" });
  const cameraRef = useRef<CameraView>(null);
  const invalidate = useInvalidateAll();

  async function shoot() {
    setPhase({ name: "uploading" });
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      const result = await uploadPhoto(kind, photo?.uri ?? "", sessionId);
      await invalidate();
      setPhase({ name: "judged", result });
    } catch (error) {
      setPhase({ name: "error", message: (error as Error).message });
    }
  }

  if (!permission?.granted) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.md }}>
        <T variant="body" kind="sub">
          공부 인증에는 카메라가 필요합니다. 책상 사진을 찍어 AI가 확인해요.
        </T>
        <Button label="카메라 권한 허용" tone="primary" onPress={requestPermission} />
      </View>
    );
  }

  if (phase.name === "judged") {
    const passed = phase.result.result === "pass";
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
        <T variant="title">
          {passed ? (kind === "start" ? "공부 시작됨" : "공부 종료됨") : "인증이 거절됐습니다"}
        </T>
        <T variant="body" kind="sub">
          {phase.result.reason}
        </T>
        {passed ? (
          <Button label="확인" tone="primary" onPress={() => router.back()} />
        ) : (
          <View style={{ gap: space.md }}>
            <Button
              label="다시 찍기"
              tone="secondary"
              onPress={() => setPhase({ name: "ready" })}
            />
            <Button
              label="이의제기"
              tone="text"
              onPress={() => router.replace(`/appeal/${phase.result.photo_id}`)}
            />
          </View>
        )}
      </View>
    );
  }

  if (phase.name === "error") {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
        <T variant="title">사진을 올리지 못했습니다</T>
        <T variant="body" kind="sub">
          {phase.message}
        </T>
        <Button label="다시 시도" tone="primary" onPress={shoot} />
        {kind === "start" && <Button label="닫기" tone="text" onPress={() => router.back()} />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      <View style={{ padding: space.xl, alignItems: "center", backgroundColor: color.bg }}>
        {phase.name === "uploading" ? (
          <View style={{ alignItems: "center", gap: space.sm }}>
            <ActivityIndicator color={color.accent} />
            <T variant="caption" kind="muted">
              판정 중…
            </T>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={shoot}
            style={({ pressed }) => ({
              width: SHUTTER_SIZE,
              height: SHUTTER_SIZE,
              borderRadius: radius.pill,
              backgroundColor: color.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <T variant="section" style={{ color: color.bg }}>
              촬영
            </T>
          </Pressable>
        )}
      </View>
    </View>
  );
}
