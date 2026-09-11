import { Tabs } from "expo-router";

import { color } from "../../src/design/tokens";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textMuted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="feed" options={{ title: "피드" }} />
      <Tabs.Screen name="records" options={{ title: "기록" }} />
      <Tabs.Screen name="settings" options={{ title: "설정" }} />
    </Tabs>
  );
}
