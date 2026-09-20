import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { View } from "react-native";

import { haptic } from "./motion";
import { T } from "./Text";
import { Touchable } from "./Touchable";
import { color, radius, space } from "./tokens";

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
  onPhoto = false,
}: {
  label?: string;
  /** 어두운 화면(챌린지) 위에서는 흰색으로 그린다. */
  onDark?: boolean;
  /** 사진 위에 놓일 때. 배경 밝기를 알 수 없으므로 면을 깐다. */
  onPhoto?: boolean;
}) {
  const fg = onDark || onPhoto ? "#FFFFFF" : color.text;
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
        // 카메라 위에서는 배경이 사진이다 — 밝은 장면에서는 흰 글자가
        // 그대로 사라진다. 어두운 반투명 면을 깔아서 어떤 사진 위에서도
        // 읽히게 한다. 어두운 '화면'(챌린지) 위에서는 면이 필요 없다.
        ...(onPhoto
          ? {
              backgroundColor: "rgba(0,0,0,0.45)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.4)",
              borderRadius: radius.pill,
              paddingLeft: space.sm,
              paddingRight: space.base,
            }
          : { paddingRight: space.base }),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Ionicons name="chevron-back" size={22} color={fg} />
        <T variant="section" style={onDark || onPhoto ? { color: fg } : undefined}>
          {label}
        </T>
      </View>
    </Touchable>
  );
}
