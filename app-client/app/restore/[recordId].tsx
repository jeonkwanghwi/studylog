import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { ApiError, api } from "../../src/api/client";
import { useInvalidateAll } from "../../src/api/hooks";
import type { DailyRecordOut } from "../../src/api/types";
import { Appear } from "../../src/design/Appear";
import { Button } from "../../src/design/Button";
import { haptic } from "../../src/design/motion";
import { T } from "../../src/design/Text";
import { color, space } from "../../src/design/tokens";
import { RESTORE_COST, formatWon } from "../../src/money/format";

type Phase =
  | { name: "confirm" }
  | { name: "sending" }
  | { name: "done"; record: DailyRecordOut }
  | { name: "failed"; detail: string };

// 402(크레딧 부족)·409(이미 처리됨/기한 지남)·404(내 기록 아님)는 모두
// 서버가 이유를 담아 보낸다. 뭉뚱그린 문구로 덮으면 안 된다.
const GENERIC_FAILURE = "복구하지 못했습니다. 잠시 후 다시 시도해주세요.";

export default function Restore() {
  const { recordId } = useLocalSearchParams<{ recordId: string }>();
  const [phase, setPhase] = useState<Phase>({ name: "confirm" });
  const invalidate = useInvalidateAll();

  async function restore() {
    setPhase({ name: "sending" });
    try {
      const record = await api.post<DailyRecordOut>(`/records/${recordId}/restore`);
      await invalidate();
      haptic.success();
      setPhase({ name: "done", record });
    } catch (error) {
      const detail =
        error instanceof ApiError && error.kind !== "other"
          ? error.detail
          : GENERIC_FAILURE;
      haptic.warning();
      setPhase({ name: "failed", detail });
    }
  }

  if (phase.name === "done") {
    return (
      <Appear style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
        <T variant="title">복구됐습니다</T>
        <T variant="body" kind="sub">
          연속 기록이 {phase.record.streak_snapshot}일로 복원됐습니다.
        </T>
        <Button label="확인" tone="primary" onPress={() => router.back()} />
      </Appear>
    );
  }

  if (phase.name === "failed") {
    return (
      <Appear style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
        <T variant="title">복구하지 못했습니다</T>
        <T variant="body" kind="sub">
          {phase.detail}
        </T>
        <Button label="닫기" tone="text" onPress={() => router.back()} />
      </Appear>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
      <T variant="title">연속 기록 복구</T>
      <T variant="body" kind="sub">
        크레딧 {formatWon(RESTORE_COST)}을 써서 끊긴 연속 기록을 되살립니다.
      </T>
      <T variant="caption" kind="muted">
        그날의 페이백은 돌아오지 않습니다. 되사는 것은 연속 기록입니다.
      </T>
      {phase.name === "sending" ? (
        <ActivityIndicator color={color.accent} />
      ) : (
        <Button
          label={`${formatWon(RESTORE_COST)}으로 복구`}
          tone="primary"
          onPress={restore}
        />
      )}
    </View>
  );
}
