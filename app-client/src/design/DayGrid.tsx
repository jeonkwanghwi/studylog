import { useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";

import { T } from "./Text";
import { color, fonts, radius, space } from "./tokens";

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
  secured: color.accentSoft,
  missed: "#FEECEE",
  pending: color.fill,
  today: color.accent,
};

const NUMBER_KIND: Record<CellState, "muted" | "accent" | "negative" | "text"> = {
  secured: "accent",
  missed: "negative",
  pending: "muted",
  today: "text", // overridden to white below
};

const NUMBER_FONT: Partial<Record<CellState, string>> = {
  secured: fonts.MEDIUM,
  today: fonts.BOLD,
};

/**
 * 챌린지 일수를 달력처럼 편다. 7열, 한 주 한 줄. 확보/실패/대기는 옅은 배경으로
 * 조용히 표시하고, 오늘만 진한 강조색으로 말한다 — 진한 파랑은 버튼 하나만의 것.
 * 오늘은 확보 여부와 무관하게 항상 가장 먼저 확인한다.
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
    const isToday = today !== undefined && toISODate(date) === today;
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
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <T
            variant="caption"
            kind={NUMBER_KIND[state]}
            style={[
              state === "today" ? { color: "#FFFFFF" } : undefined,
              NUMBER_FONT[state] ? { fontFamily: NUMBER_FONT[state] } : undefined,
            ]}
          >
            {date.getDate()}
          </T>
        </View>
      ))}
    </View>
  );
}
