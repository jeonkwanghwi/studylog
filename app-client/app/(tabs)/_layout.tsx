// 패밀리를 직접 가리킨다. "@expo/vector-icons" 루트에서 가져오면
// 쓰지도 않는 아이콘 폰트 20여 개가 통째로 번들에 들어간다.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

import { haptic } from "../../src/design/motion";
import { color, fonts } from "../../src/design/tokens";

type IconName = keyof typeof Ionicons.glyphMap;

// 선택됐을 때만 채워진 아이콘을 쓴다. 색만으로 구분하면 색각 이상이 있는
// 사람에게는 어느 탭에 있는지 보이지 않는다.
const ICONS: Record<string, [IconName, IconName]> = {
  index: ["home-outline", "home"],
  feed: ["people-outline", "people"],
  records: ["calendar-outline", "calendar"],
  settings: ["settings-outline", "settings"],
};

const TITLES: Record<string, string> = {
  index: "홈",
  feed: "피드",
  records: "기록",
  settings: "설정",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textMuted,
        title: TITLES[route.name],
        tabBarIcon: ({ focused, color: tint, size }) => {
          const [outline, filled] = ICONS[route.name];
          return <Ionicons name={focused ? filled : outline} size={size} color={tint} />;
        },
        tabBarLabelStyle: { fontFamily: fonts.MEDIUM, fontSize: 11, letterSpacing: -0.1 },
        tabBarStyle: {
          backgroundColor: color.bg,
          borderTopColor: color.line,
          borderTopWidth: Platform.OS === "ios" ? 0.5 : 1,
        },
      })}
      // 탭을 바꾸는 것은 화면이 통째로 바뀌는 일이다. 손끝에도 알려준다.
      screenListeners={{ tabPress: () => haptic.tap() }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="records" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
