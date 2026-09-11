import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";

import { ApiError } from "../src/api/client";
import { clearToken } from "../src/auth/storage";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { color, fonts } from "../src/design/tokens";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
  // 401은 토큰 만료로 간주한다. 토큰을 지우면 useAuth의 token 쿼리가
  // signedOut으로 떨어지고, 게이트(app/index.tsx)가 로그인 화면으로 보낸다.
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.kind === "auth") {
        // 이전 유저의 캐시(me/session/records...)가 다음 로그인까지 남으면 안 된다.
        // token 쿼리는 useAuth가 구독 중이라 통째로 지우면 옵저버가 빈 쿼리를
        // 다시 붙잡고 SecureStore를 재조회해 방금 지운 값을 덮어쓴다.
        clearToken().then(() => {
          queryClient.removeQueries({
            predicate: (query) => query.queryKey[0] !== "token",
          });
          queryClient.setQueryData(["token"], null);
        });
      }
    },
  }),
});

export default function RootLayout() {
  // React Query 의 포커스 감지는 웹의 window 이벤트에 기대고 있어서 RN 에서는
  // 아무 일도 하지 않는다. 직접 이어주지 않으면 앱을 두 시간 두고 돌아와도
  // 나갈 때의 데이터가 그대로 있다 — 그 사이 세션이 회수됐거나 정산이 끝나
  // 돈이 들어왔어도 화면은 모른다.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (status) =>
      focusManager.setFocused(status === "active")
    );
    return () => sub.remove();
  }, []);

  const [loaded] = useFonts({
    [fonts.REGULAR]: require("../assets/fonts/Pretendard-Regular.otf"),
    [fonts.MEDIUM]: require("../assets/fonts/Pretendard-Medium.otf"),
    [fonts.BOLD]: require("../assets/fonts/Pretendard-Bold.otf"),
  });
  if (!loaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.bg },
            // 안드로이드 기본값은 위로 튀어오르는 전환이라 iOS 와 방향이
            // 어긋난다. 같은 앱이 플랫폼마다 다르게 움직이면 안 된다.
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen
            name="capture"
            options={{ presentation: "modal", gestureEnabled: false }}
          />
          <Stack.Screen name="declare" options={{ presentation: "modal" }} />
          <Stack.Screen name="appeal/[photoId]" options={{ presentation: "modal" }} />
          <Stack.Screen name="restore/[recordId]" options={{ presentation: "modal" }} />
          <Stack.Screen name="challenge/select" />
          <Stack.Screen name="groups/index" />
        </Stack>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
