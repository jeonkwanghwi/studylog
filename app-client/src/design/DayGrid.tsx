import { useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";

import { T } from "./Text";
import { color, radius, space } from "./tokens";

export type Mark = "secured" | "missed" | "pending";

const COLUMNS = 7;

function addDays(start: string, index: number): Date {
  const [y, m, d] = start.split("-").map(Number);
  return new Date(y, m - 1, d + index);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type CellState = Mark | "today";

const BG: Record<CellState, string> = {
  secured: color.accent,
  missed: `${color.negative}20`, // 12% opacity
  pending: color.fill,
  today: color.accentSoft,
};

const NUMBER_KIND: Record<CellState, "muted" | "accent" | "negative"> = {
  secured: "accent", // overridden to white below
  missed: "negative",
  pending: "muted",
  today: "accent",
};

/**
 * 챌린지 일수를 달력처럼 편다. 7열, 한 주 한 줄. 확보/실패/대기/오늘을
 * 색이 아니라 배경 대비와 테두리로 구분해 평평한 진행바보다 차분하게 읽힌다.
 */
export function DayGrid({
  start,
  days,
  marks,
  today,
}: {
  start: string;
  days: number;
  marks: Mark[];
  today?: string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const cellSize = width > 0 ? (width - space.xs * (COLUMNS - 1)) / COLUMNS : undefined;

  const cells = Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    const mark: Mark = marks[i] ?? "pending";
    const isToday = mark === "pending" && today !== undefined && toISODate(date) === today;
    const state: CellState = isToday ? "today" : mark;
    return { date, state };
  });

  return (
    <View onLayout={onLayout} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {cells.map(({ date, state }, index) => (
        <View
          key={index}
          testID="day-cell"
          style={{
            width: cellSize,
            aspectRatio: 1,
            backgroundColor: BG[state],
            borderRadius: radius.chip,
            borderWidth: state === "today" ? 1.5 : 0,
            borderColor: state === "today" ? color.accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <T
            variant="caption"
            kind={NUMBER_KIND[state]}
            style={state === "secured" ? { color: "#FFFFFF" } : undefined}
          >
            {date.getDate()}
          </T>
        </View>
      ))}
    </View>
  );
}
