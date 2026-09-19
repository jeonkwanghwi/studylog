import { router } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";

import { useMe, useRecords } from "../../src/api/hooks";
import { Amount } from "../../src/design/Amount";
import { Button } from "../../src/design/Button";
import { Card } from "../../src/design/Card";
import { LoadFailed } from "../../src/design/LoadFailed";
import { ListSkeleton } from "../../src/design/Skeleton";
import { useScreenPadding } from "../../src/design/safeArea";
import { T } from "../../src/design/Text";
import { color, space } from "../../src/design/tokens";
import { RESTORE_COST, formatWon } from "../../src/money/format";
import { canRestore, formatElapsed } from "../../src/time/elapsed";
import type { DailyRecordOut } from "../../src/api/types";

const LABEL: Record<DailyRecordOut["result"], string> = {
  success: "달성",
  passed: "복구됨",
  failed: "미달",
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
      <T variant="title">기록</T>

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
              <T variant="section">{record.date}</T>
              <T variant="body" kind={record.result === "failed" ? "negative" : "sub"}>
                {LABEL[record.result]}
              </T>
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
                  {formatWon(balance)}입니다 — 목표를 채운 날마다 쌓입니다.
                </T>
              ))}
          </Card>
        );
      })}
    </ScrollView>
  );
}
