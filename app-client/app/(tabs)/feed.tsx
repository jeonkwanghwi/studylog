import { router } from "expo-router";
import { View } from "react-native";

import { useGroups } from "../../src/api/hooks";
import { Button } from "../../src/design/Button";
import { T } from "../../src/design/Text";
import { space } from "../../src/design/tokens";

export default function Feed() {
  const groups = useGroups();

  if (!groups.isLoading && (groups.data ?? []).length === 0) {
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
    <View style={{ flex: 1 }}>
      <T variant="title">피드</T>
    </View>
  );
}
