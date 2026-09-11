import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { useFeed, useGroups } from "../../src/api/hooks";
import type { FeedItemOut } from "../../src/api/types";
import { PhotoGrid } from "../../src/components/PhotoGrid";
import { Button } from "../../src/design/Button";
import { Card } from "../../src/design/Card";
import { ListSkeleton } from "../../src/design/Skeleton";
import { T } from "../../src/design/Text";
import { Touchable } from "../../src/design/Touchable";
import { color, radius, space } from "../../src/design/tokens";
import { formatElapsed } from "../../src/time/elapsed";

// result 는 정산 전엔 null 이다. 04시 정산 전까지는 대부분 null 이므로
// 여기서 실패로 오해할 마크를 달면 아직 공부 중인 사람에게 거짓을 말하는 것이다.
const RESULT_LABEL: Record<"success" | "passed" | "failed", string> = {
  success: "✓ 달성",
  passed: "✓ 복구됨",
  failed: "✗ 미인증",
};

export default function Feed() {
  const groups = useGroups();
  const list = groups.data ?? [];
  const [selected, setSelected] = useState<string | undefined>();
  const groupId = selected ?? list[0]?.id;
  const feed = useFeed(groupId);

  if (groups.isLoading) {
    return <ListSkeleton rows={2} />;
  }

  if (list.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
        <T variant="body" kind="sub">
          그룹에 참여하면 친구들의 인증을 볼 수 있습니다.
        </T>
        <Button label="그룹 만들거나 참여하기" tone="text" onPress={() => router.push("/groups")} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.xl, paddingTop: space.huge, gap: space.base }}
      refreshControl={
        <RefreshControl
          refreshing={feed.isFetching}
          onRefresh={() => feed.refetch()}
          tintColor={color.textMuted}
        />
      }
    >
      <T variant="title">피드</T>

      {list.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm }}
        >
          {list.map((group) => {
            const active = group.id === groupId;
            return (
              <Touchable
                key={group.id}
                accessibilityRole="button"
                feedback={false}
                onPress={() => setSelected(group.id)}
                style={{
                  paddingHorizontal: space.base,
                  paddingVertical: space.sm,
                  borderRadius: radius.pill,
                  backgroundColor: active ? color.accentSoft : color.fill,
                }}
              >
                <T variant="body" kind={active ? "accent" : "sub"}>
                  {group.name}
                </T>
              </Touchable>
            );
          })}
        </ScrollView>
      )}

      {(feed.data ?? []).map((item) => (
        <FeedRow key={item.user_id} item={item} />
      ))}
    </ScrollView>
  );
}

function FeedRow({ item }: { item: FeedItemOut }) {
  const label = item.result ? RESULT_LABEL[item.result] : null;
  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T variant="section">{item.nickname}</T>
        <T variant="caption" kind="muted">
          {item.streak_count}일 연속
        </T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        <T variant="body" kind="sub">
          {formatElapsed(item.total_minutes)} / {item.goal_minutes}분
        </T>
        {label && (
          <T variant="body" kind={item.result === "failed" ? "negative" : "accent"}>
            {label}
          </T>
        )}
      </View>
      <PhotoGrid photos={item.photos} />
    </Card>
  );
}
