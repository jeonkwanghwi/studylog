import { router } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";

import { useMe, useRecords } from "../../src/api/hooks";
import { Amount } from "../../src/design/Amount";
import { Badge } from "../../src/design/Badge";
import { Button } from "../../src/design/Button";
import { Card } from "../../src/design/Card";
import { LoadFailed } from "../../src/design/LoadFailed";
import { ScreenTitle } from "../../src/design/ScreenTitle";
import { ListSkeleton } from "../../src/design/Skeleton";
import { useScreenPadding } from "../../src/design/safeArea";
import { T } from "../../src/design/Text";
import { color, space } from "../../src/design/tokens";
import { RESTORE_COST, formatWon } from "../../src/money/format";
import { canRestore, formatElapsed } from "../../src/time/elapsed";
import { formatStudyDay } from "../../src/time/studyDay";
import type { DailyRecordOut } from "../../src/api/types";

// 피드와 같은 말·같은 모양을 쓴다. 전에는 여기만 '미달'이라 부르고 흐린
// 글자로 그렸고 피드는 '미인증' 뱃지였다 — 같은 상태를 두 이름으로 부르면
// 유저는 다른 일이 일어난 줄 안다.
const RESULT: Record<DailyRecordOut["result"],
                     { label: string; tone: "positive" | "negative" }> = {
  success: { label: "달성", tone: "positive" },
  passed: { label: "복구됨", tone: "positive" },
  failed: { label: "미인증", tone: "negative" },
};

export default function Records() {
  const screenPadding = useScreenPadding();
  const records = useRecords();
  const me = useMe();
  const balance = me.data?.credit_balance ?? 0;
  const now = new Date();

  if (records.isLoading) {
    return <ListSkeleton />;
  }

  if (records.isError) {
    return <LoadFailed what="기록" onRetry={() => records.refetch()} />;
  }

  const list = records.data ?? [];

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.md, ...screenPadding }}
      refreshControl={
        <RefreshControl
          refreshing={records.isFetching && !records.isLoading}
          onRefresh={() => {
            records.refetch();
            me.refetch();
          }}
          tintColor={color.textMuted}
        />
      }
    >
      <ScreenTitle title="기록" subtitle="하루하루 확보한 금액이 여기 쌓여요." />

      {list.length === 0 && (
        <T variant="body" kind="sub">
          아직 기록이 없습니다. 오늘 공부를 시작하면 여기에 하루하루 쌓여요.
        </T>
      )}

      {list.map((record) => {
        const restorable =
          record.result === "failed" && canRestore(record.settled_at, now);

        return (
          <Card key={record.id} style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T variant="section">{formatStudyDay(record.date)}</T>
              <Badge {...RESULT[record.result]} />
            </View>

            <View
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
            >
              <T variant="caption" kind="muted">
                {formatElapsed(record.total_minutes)} / {record.goal_minutes}분
              </T>
              {record.payback_amount > 0 && (
                <Amount value={record.payback_amount} kind="accent" />
              )}
            </View>

            {restorable &&
              (balance >= RESTORE_COST ? (
                <Button
                  label="복구하기"
                  tone="text"
                  onPress={() => router.push(`/restore/${record.id}`)}
                />
              ) : (
                <T variant="caption" kind="muted">
                  복구에는 {formatWon(RESTORE_COST)}이 필요해요. 지금 크레딧은{" "}
                  {formatWon(balance)}입니다. 목표를 채운 날마다 쌓여요.
                </T>
              ))}
          </Card>
        );
      })}
    </ScrollView>
  );
}
