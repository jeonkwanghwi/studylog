import { View, type ViewProps } from "react-native";

import { color, radius, space } from "./tokens";

/** 종이 한 장. 그림자를 쓰지 않는다 — 종이는 떠 있지 않다. */
export function Sheet({ style, ...rest }: ViewProps) {
  return (
    <View
      style={[
        {
          backgroundColor: color.paper,
          borderRadius: radius.sheet,
          borderWidth: 1,
          borderColor: color.line,
          padding: space.md,
        },
        style,
      ]}
      {...rest}
    />
  );
}
