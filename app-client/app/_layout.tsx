import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";

import { ApiError } from "../src/api/client";
import { clearToken } from "../src/auth/storage";
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
  const [loaded] = useFonts({
    [fonts.REGULAR]: require("../assets/fonts/Pretendard-Regular.otf"),
    [fonts.MEDIUM]: require("../assets/fonts/Pretendard-Medium.otf"),
    [fonts.BOLD]: require("../assets/fonts/Pretendard-Bold.otf"),
  });
  if (!loaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
        }}
      >
        <Stack.Screen name="capture" options={{ presentation: "modal" }} />
        <Stack.Screen name="appeal/[photoId]" options={{ presentation: "modal" }} />
        <Stack.Screen name="restore/[recordId]" options={{ presentation: "modal" }} />
        <Stack.Screen name="challenge/select" />
      </Stack>
    </QueryClientProvider>
  );
}
