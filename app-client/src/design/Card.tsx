import { Platform, View, type ViewProps } from "react-native";

import { color, radius, space } from "./tokens";

const SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  android: { elevation: 1 },
  default: {},
});

export function Card({ style, ...rest }: ViewProps) {
  return (
    <View
      style={[
        {
          backgroundColor: color.bg,
          borderRadius: radius.card,
          padding: space.lg,
        },
        SHADOW,
        style,
      ]}
      {...rest}
    />
  );
}
