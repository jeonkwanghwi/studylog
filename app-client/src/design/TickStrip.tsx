import { View } from "react-native";

import { color, radius, space } from "./tokens";

export type Mark = "secured" | "missed" | "pending";

const FILL: Record<Mark, string> = {
  secured: color.highlight,
  missed: color.stamp,
  pending: "transparent",
};

/**
 * 챌린지 일수를 눈금으로 편다. 이 앱에서 유일하게 대담한 요소다 —
 * D-day 카운터와 통장 정리가 한 줄에 겹친 것. 확보한 날은 형광으로 칠하고
 * 놓친 날은 인주색으로 남긴다.
 */
export function TickStrip({ days, marks }: { days: number; marks: Mark[] }) {
  const filled: Mark[] = Array.from(
    { length: days },
    (_, i) => marks[i] ?? "pending"
  );

  return (
    <View style={{ flexDirection: "row", gap: 3, alignItems: "flex-end" }}>
      {filled.map((mark, index) => (
        <View
          key={index}
          testID="tick"
          style={{
            flex: 1,
            height: mark === "pending" ? space.md : space.lg,
            backgroundColor: FILL[mark],
            borderWidth: 1,
            borderColor: mark === "pending" ? color.line : "transparent",
            borderRadius: radius.tick,
          }}
        />
      ))}
    </View>
  );
}
