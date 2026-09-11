import { router } from "expo-router";
import { ScrollView, View } from "react-native";

import { useMe, useRecords } from "../../src/api/hooks";
import { Amount } from "../../src/design/Amount";
import { Button } from "../../src/design/Button";
import { Card } from "../../src/design/Card";
import { T } from "../../src/design/Text";
import { space } from "../../src/design/tokens";
import { RESTORE_COST, formatWon } from "../../src/money/format";
import { canRestore, formatElapsed } from "../../src/time/elapsed";
import type { DailyRecordOut } from "../../src/api/types";

const LABEL: Record<DailyRecordOut["result"], string> = {
  success: "달성",
  passed: "복구됨",
  failed: "미달",
};

export default function Records() {
  const records = useRecords();
  const me = useMe();
  const balance = me.data?.credit_balance ?? 0;
  const now = new Date();

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, paddingTop: space.huge, gap: space.md }}
    >
      <T variant="title">기록</T>

      {(records.data ?? []).map((record) => {
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
                  복구하려면 크레딧이 부족합니다 ({formatWon(RESTORE_COST)} 필요)
                </T>
              ))}
          </Card>
        );
      })}
    </ScrollView>
  );
}
