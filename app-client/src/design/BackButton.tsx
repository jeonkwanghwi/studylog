import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { View } from "react-native";

import { haptic } from "./motion";
import { T } from "./Text";
import { Touchable } from "./Touchable";
import { color, space } from "./tokens";

/**
 * 화면 왼쪽 위 뒤로가기.
 *
 * iOS 는 가장자리 스와이프로 돌아갈 수 있지만 그걸 모르는 사람이 많다.
 * 스와이프만 남겨두면 그런 사람은 화면에 갇힌다.
 *
 * 아이콘만 두지 않고 글자를 같이 둔다 — 화살표 하나가 무슨 뜻인지도
 * 배워야 아는 것이고, 44pt 터치 영역도 아이콘만으로는 작다.
 */
export function BackButton({
  label = "뒤로",
  onDark = false,
}: {
  label?: string;
  /** 카메라 같은 어두운 화면 위에서는 흰색으로 그린다. */
  onDark?: boolean;
}) {
  const fg = onDark ? "#FFFFFF" : color.text;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        router.back();
      }}
      style={{
        alignSelf: "flex-start",
        minHeight: 44,
        justifyContent: "center",
        paddingRight: space.base,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Ionicons name="chevron-back" size={22} color={fg} />
        <T variant="section" style={onDark ? { color: fg } : undefined}>
          {label}
        </T>
      </View>
    </Touchable>
  );
}
