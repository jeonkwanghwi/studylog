import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Linking,
  View,
} from "react-native";

import { ApiError } from "../src/api/client";
import { useInvalidateAll } from "../src/api/hooks";
import type { JudgeResultOut } from "../src/api/types";
import { uploadPhoto, type ShotKind } from "../src/api/upload";
import { Appear } from "../src/design/Appear";
import { Button } from "../src/design/Button";
import { haptic } from "../src/design/motion";
import { T } from "../src/design/Text";
import { Touchable } from "../src/design/Touchable";
import { color, radius, space } from "../src/design/tokens";
import { remainingBeforeForfeit } from "../src/time/elapsed";

type Phase =
  | { name: "ready" }
  // 올리는 동안 찍은 사진을 보여준다. 카메라가 계속 떠 있으면 셔터가
  // 눌렸는지도 모르겠고, 무엇이 올라가는지도 안 보인다.
  | { name: "uploading"; uri: string }
  | { name: "judged"; result: JudgeResultOut }
  // uri 를 들고 있어야 "다시 시도"가 같은 사진을 다시 올린다. 사진은 이미
  // 찍혔고 실패한 것은 업로드다 — 다시 찍게 하면 유저 시간을 뺏고,
  // 종료 샷이면 그 사이 회수 시각이 다가온다.
  | { name: "error"; message: string; notFound: boolean; uri?: string };

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

  async function send(uri: string) {
    setPhase({ name: "uploading", uri });
    try {
      const result = await uploadPhoto(kind, uri, { sessionId, activity });
      await invalidate();
      if (result.result === "pass") haptic.success();
      else haptic.warning();
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
        setPhase({
          name: "error",
          message: (error as Error).message,
          notFound: false,
          uri,   // 같은 사진으로 다시 시도할 수 있게 들고 있는다
        });
      }
    }
  }

  async function shoot() {
    // 에러 화면에서는 CameraView 가 렌더되지 않아 ref 가 비어 있다. 그때
    // 찍으려 들면 uri 없이 업로드하게 되고, 네이티브가 없는 경로를 열려다
    // 앱이 통째로 죽는다.
    if (!cameraRef.current) {
      setPhase({ name: "ready" });
      return;
    }
    let uri: string;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error("사진을 만들지 못했습니다.");
      uri = photo.uri;
    } catch (error) {
      setPhase({ name: "error", message: (error as Error).message, notFound: false });
      return;
    }
    await send(uri);
  }

  if (!permission?.granted) {
    // 한 번 완전히 거부하면 requestPermission() 은 OS 다이얼로그를 다시 띄우지
    // 않고 조용히 아무 일도 하지 않는다. 그 상태에서 이 화면만 주면 인증을
    // 영영 못 해서 그날 공부를 시작할 수도, 끝낼 수도 없다.
    const askable = permission?.canAskAgain !== false;
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.md }}>
        <T variant="body" kind="sub">
          {askable
            ? "공부 인증에는 카메라가 필요합니다. 책상 사진을 찍어 AI가 확인해요."
            : "카메라 권한이 꺼져 있어 인증을 할 수 없습니다. 설정에서 카메라를 켜주세요."}
        </T>
        {askable ? (
          <Button label="카메라 권한 허용" tone="primary" onPress={requestPermission} />
        ) : (
          <Button label="설정 열기" tone="primary" onPress={() => Linking.openSettings()} />
        )}
        <Button label="닫기" tone="quiet" onPress={() => router.back()} />
      </View>
    );
  }

  if (phase.name === "judged") {
    const passed = phase.result.result === "pass";
    return (
      <Appear style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
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
      </Appear>
    );
  }

  if (phase.name === "error") {
    const isEnd = kind === "end";

    if (phase.notFound) {
      // 재시도로는 절대 뚫리지 않는다 — 다시 찍기를 주면 안 되고, 나갈 방법을 줘야 한다.
      return (
        <Appear style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
          <T variant="title">세션을 찾을 수 없습니다</T>
          <T variant="body" kind="sub">
            {phase.message}
          </T>
          <Button label="확인" tone="primary" onPress={() => router.back()} />
        </Appear>
      );
    }

    const remaining = isEnd && startedAt ? remainingBeforeForfeit(startedAt, new Date()) : null;

    return (
      <Appear style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
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
        <Button
          label="다시 시도"
          tone="primary"
          onPress={() => (phase.uri ? send(phase.uri) : shoot())}
        />
        {!isEnd && <Button label="닫기" tone="quiet" onPress={() => router.back()} />}
      </Appear>
    );
  }

  const uploading = phase.name === "uploading";

  return (
    <View style={{ flex: 1 }}>
      {uploading ? (
        // 찍은 사진을 그대로 띄우고 그 위에 판정 중임을 겹친다.
        <View style={{ flex: 1 }}>
          <Image source={{ uri: phase.uri }} style={{ flex: 1 }} resizeMode="cover" />
          <View
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(25,31,40,0.45)",
              gap: space.md,
            }}
          >
            <ActivityIndicator color="#FFFFFF" size="large" />
            <T variant="section" style={{ color: "#FFFFFF" }}>
              판정 중…
            </T>
          </View>
        </View>
      ) : (
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      )}
      <View style={{ padding: space.xl, alignItems: "center", backgroundColor: color.bg }}>
        {uploading ? (
          <T variant="caption" kind="muted">
            사진을 확인하고 있어요
          </T>
        ) : (
          <Touchable
            accessibilityRole="button"
            onPress={shoot}
            style={{
              width: SHUTTER_SIZE,
              height: SHUTTER_SIZE,
              borderRadius: radius.pill,
              backgroundColor: color.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T variant="section" style={{ color: color.bg }}>
              촬영
            </T>
          </Touchable>
        )}
      </View>
    </View>
  );
}
