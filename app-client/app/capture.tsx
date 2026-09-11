import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, View } from "react-native";

import { ApiError } from "../src/api/client";
import { useInvalidateAll } from "../src/api/hooks";
import type { JudgeResultOut } from "../src/api/types";
import { uploadPhoto, type ShotKind } from "../src/api/upload";
import { Button } from "../src/design/Button";
import { T } from "../src/design/Text";
import { color, radius, space } from "../src/design/tokens";
import { remainingBeforeForfeit } from "../src/time/elapsed";

type Phase =
  | { name: "ready" }
  | { name: "uploading" }
  | { name: "judged"; result: JudgeResultOut }
  | { name: "error"; message: string; notFound: boolean };

const SHUTTER_SIZE = 76;

export default function Capture() {
  const { kind, sessionId, startedAt, activity } = useLocalSearchParams<{
    kind: ShotKind;
    sessionId?: string;
    startedAt?: string;
    activity?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ name: "ready" });
  const cameraRef = useRef<CameraView>(null);
  const invalidate = useInvalidateAll();
  const navigation = useNavigation();

  // 종료 샷이 error 이고 재시도로 절대 뚫리지 않을 상태(notFound)가 아니면,
  // 이 화면을 빠져나갈 수 없다 — 나가면 세션이 4시간 뒤 조용히 회수된다.
  // ready/judged 등 다른 상태에서는(특히 시작 경로에서는) 절대 막지 않는다 —
  // 하드웨어 back 과 iOS 스와이프 두 출구를 이 하나의 조건으로만 통제한다.
  const blockExit = kind === "end" && phase.name === "error" && !phase.notFound;

  useEffect(() => {
    if (!blockExit) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [blockExit]);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !blockExit });
  }, [navigation, blockExit]);

  async function shoot() {
    setPhase({ name: "uploading" });
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      const result = await uploadPhoto(kind, photo?.uri ?? "", { sessionId, activity });
      await invalidate();
      setPhase({ name: "judged", result });
    } catch (error) {
      if (error instanceof ApiError && error.kind === "notFound") {
        // 404 는 이 세션이 이미 끝났거나 회수됐다는 뜻이다 — 재시도해도 절대
        // 성공할 수 없으므로, 종료 경로라도 나갈 방법을 줘야 한다.
        setPhase({
          name: "error",
          message: "이미 종료되었거나 더 이상 열려 있지 않은 세션입니다.",
          notFound: true,
        });
      } else {
        setPhase({ name: "error", message: (error as Error).message, notFound: false });
      }
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
    const isEnd = kind === "end";

    if (phase.notFound) {
      // 재시도로는 절대 뚫리지 않는다 — 다시 찍기를 주면 안 되고, 나갈 방법을 줘야 한다.
      return (
        <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
          <T variant="title">세션을 찾을 수 없습니다</T>
          <T variant="body" kind="sub">
            {phase.message}
          </T>
          <Button label="확인" tone="primary" onPress={() => router.back()} />
        </View>
      );
    }

    const remaining = isEnd && startedAt ? remainingBeforeForfeit(startedAt, new Date()) : null;

    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
        <T variant="title">사진을 올리지 못했습니다</T>
        <T variant="body" kind="sub">
          {phase.message}
        </T>
        {isEnd && (
          // 여기서 닫기를 주면 안 된다. 유저가 끝냈다고 믿고 나가면
          // 세션은 4시간 뒤 0분으로 회수되고 그날 페이백도 사라진다.
          <T variant="body" kind="negative">
            아직 공부가 끝나지 않았습니다.
            {remaining !== null && ` ${remaining}분 안에 종료하지 않으면 오늘 기록이 사라집니다.`}
          </T>
        )}
        <Button label="다시 시도" tone="primary" onPress={shoot} />
        {!isEnd && <Button label="닫기" tone="text" onPress={() => router.back()} />}
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
