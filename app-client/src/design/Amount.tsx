import { View } from "react-native";

import { T } from "./Text";
import { space } from "./tokens";

type Size = "hero" | "amount";
type Kind = "text" | "sub" | "muted" | "accent" | "negative";

const UNIT_VARIANT: Record<Size, "title" | "caption"> = {
  hero: "title",
  amount: "caption",
};

/** 금액. 숫자는 hero/amount, 단위 '원'은 별도 노드로 뒤에 붙인다. '₩'는 쓰지 않는다. */
export function Amount({
  value,
  size = "amount",
  kind = "text",
}: {
  value: number;
  size?: Size;
  kind?: Kind;
}) {
  const sign = value < 0 ? "-" : "";
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
      <T variant={size} kind={kind}>
        {sign}
        {Math.abs(value).toLocaleString("ko-KR")}
      </T>
      <T variant={UNIT_VARIANT[size]} kind={kind}>
        원
      </T>
    </View>
  );
}
