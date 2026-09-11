import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { api } from "../src/api/client";
import { keys } from "../src/api/hooks";
import type { UserOut } from "../src/api/types";
import { hasOnboarded } from "../src/auth/storage";
import { useAuth } from "../src/auth/useAuth";
import { color } from "../src/design/tokens";

export default function Index() {
  const { status } = useAuth();

  const me = useQuery({
    queryKey: keys.me,
    queryFn: () => api.get<UserOut>("/users/me"),
    enabled: status === "signedIn",
  });

  const onboarded = useQuery({
    queryKey: ["onboarded", me.data?.id],
    queryFn: () => hasOnboarded(me.data!.id),
    enabled: Boolean(me.data?.id),
  });

  const ready = status !== "signedIn" || (me.isSuccess && onboarded.isSuccess);

  if (status === "loading" || !ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }

  if (status !== "signedIn") return <Redirect href="/login" />;
  return <Redirect href={onboarded.data ? "/(tabs)" : "/onboarding"} />;
}
