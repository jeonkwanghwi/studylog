import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "../src/auth/useAuth";
import { color } from "../src/design/tokens";

export default function Index() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }
  return <Redirect href={status === "signedIn" ? "/(tabs)" : "/login"} />;
}
