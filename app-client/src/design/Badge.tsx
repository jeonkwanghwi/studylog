import { View } from "react-native";

import { T } from "./Text";
import { color, fonts, radius, space } from "./tokens";

type Tone = "positive" | "negative" | "neutral";

const STYLE: Record<Tone, { bg: string; fg: "accent" | "negative" | "muted" }> = {
  positive: { bg: color.accentSoft, fg: "accent" },
  negative: { bg: color.negativeSoft, fg: "negative" },
  neutral: { bg: color.fill, fg: "muted" },
};

/**
 * 상태를 한 단어로 말하는 뱃지.
 *
 * 전에는 "✓ 달성" 처럼 글자에 기호를 섞었다. 색맹 사용자에게 ✓ 와 ✗ 는
 * 크기도 위치도 비슷해서 구분이 안 되고, 스크린리더는 "체크 달성" 이라고
 * 읽는다. 배경·글자색·굵기 세 가지로 구분하면 색 하나에 기대지 않는다.
 */
export function Badge({ label, tone }: { label: string; tone: Tone }) {
  const s = STYLE[tone];
  return (
    <View
      style={{
        backgroundColor: s.bg,
        borderRadius: radius.chip,
        paddingVertical: space.xs,
        paddingHorizontal: space.sm,
      }}
    >
      <T variant="caption" kind={s.fg} style={{ fontFamily: fonts.MEDIUM }}>
        {label}
      </T>
    </View>
  );
}
