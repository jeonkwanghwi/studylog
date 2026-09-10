import { View } from "react-native";
import { T } from "./Text";
import { space } from "./tokens";

type Size = "display" | "amount";

/**
 * 금액. 숫자만 고정폭으로 두고 '원'은 산세리프로 뒤에 붙인다.
 * IBM Plex Mono 에는 ₩ 글리프가 없어서 고정폭 칸에 폴백 글리프가 짓눌린다.
 * 한국어에서는 어차피 '18,000원'이 '₩18,000'보다 자연스럽고,
 * 큰 숫자 + 작은 단위는 통장·가격표의 오래된 조판이기도 하다.
 */
export function Amount({
  value,
  size = "amount",
  kind = "ink",
}: {
  value: number;
  size?: Size;
  kind?: "ink" | "muted" | "stamp";
}) {
  const sign = value < 0 ? "-" : "";
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
      <T variant={size} kind={kind}>
        {sign}
        {Math.abs(value).toLocaleString("ko-KR")}
      </T>
      <T variant={size === "display" ? "title" : "small"} kind={kind}>
        원
      </T>
    </View>
  );
}
