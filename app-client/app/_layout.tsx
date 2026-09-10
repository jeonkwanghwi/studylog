import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";

import { color, fonts } from "../src/design/tokens";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
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
      />
    </QueryClientProvider>
  );
}
