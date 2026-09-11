import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";


import { api } from "../src/api/client";
import { keys } from "../src/api/hooks";
import type { UserOut } from "../src/api/types";
import { hasOnboarded } from "../src/auth/storage";
import { useAuth } from "../src/auth/useAuth";
import { LoadFailed } from "../src/design/LoadFailed";
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

  // me 가 실패하면 ready 는 영원히 false 다. 401 은 _layout 이 토큰을 지워
  // signedOut 으로 떨어뜨리지만, 네트워크 오류는 아무도 처리하지 않아서
  // 앱을 켜자마자 무한 스피너에 갇힌다 — 나갈 방법이 없다.
  if (status === "signedIn" && me.isError) {
    return <LoadFailed what="내 정보" onRetry={() => me.refetch()} />;
  }

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
