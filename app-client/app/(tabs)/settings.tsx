import { router } from "expo-router";
import { View } from "react-native";

import { Button } from "../../src/design/Button";
import { T } from "../../src/design/Text";
import { space } from "../../src/design/tokens";

export default function Settings() {
  return (
    <View style={{ flex: 1, padding: space.xl, paddingTop: space.huge, gap: space.xl }}>
      <T variant="title">설정</T>
      <Button label="그룹 관리" tone="secondary" onPress={() => router.push("/groups")} />
    </View>
  );
}
