import { Link } from "expo-router";
import { View } from "react-native";

import { T } from "../src/design/Text";
import { space } from "../src/design/tokens";

export default function NotFound() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: space.md }}>
      <T variant="body">없는 화면입니다.</T>
      <Link href="/">
        <T variant="body" kind="accent">
          홈으로
        </T>
      </Link>
    </View>
  );
}
