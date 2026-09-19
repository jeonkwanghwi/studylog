import { Platform, View, type ViewProps } from "react-native";

import { color, radius, space } from "./tokens";

/**
 * 카드는 두 종류다. 전에는 하나뿐이라, 눌러서 무언가 일어나는 카드와
 * 정보만 담은 카드가 똑같이 떠 보였다. 그림자가 깊이를 말하지 못하면
 * 그냥 장식이다.
 *
 *   raised  누를 수 있는 것. 떠 있어 보인다. (그룹 카드, 상품 카드)
 *   flat    읽기만 하는 것. 테두리로 구역만 나눈다. (기록, 피드)
 */
type Elevation = "raised" | "flat";

const RAISED = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  android: { elevation: 2 },
  default: {},
});

export function Card({
  elevation = "flat",
  style,
  ...rest
}: ViewProps & { elevation?: Elevation }) {
  return (
    <View
      style={[
        {
          backgroundColor: color.bg,
          borderRadius: radius.card,
          padding: space.lg,
        },
        elevation === "raised"
          ? RAISED
          : { borderWidth: 1, borderColor: color.line },
        style,
      ]}
      {...rest}
    />
  );
}
