import { Text as RNText, useWindowDimensions, type TextProps } from "react-native";

import { color, type } from "./tokens";

type Variant = keyof typeof type;
export type Kind = "text" | "sub" | "muted" | "accent" | "negative";

const TONE: Record<Kind, string> = {
  text: color.text,
  sub: color.textSub,
  muted: color.textMuted,
  // 강조 글자는 항상 진한 쪽(accentStrong)이다. 밝은 accent(#2B6CF6)는
  // 흰 배경에서는 4.59 로 간신히 통과하지만, 회색 카드 위 4.16 / 옅은
  // 파랑 면 위 3.45 로 배경이 조금만 짙어져도 바로 무너진다. 그래서
  // 두 색의 역할을 나눈다 — accent 는 '면', accentStrong 은 '글자'.
  accent: color.accentStrong,
  negative: color.negative,
};

export function T({
  variant = "body",
  kind = "text",
  style,
  ...rest
}: TextProps & { variant?: Variant; kind?: Kind }) {
  // 시스템 글자 크기를 키우면 RN 은 fontSize 만 곱해주고 lineHeight 는
  // 우리가 적은 고정값 그대로 둔다. 그래서 큰 글씨 설정에서 글자는 커지는데
  // 줄 간격은 그대로라 줄끼리 겹치고 잘린다 — 글자를 키워 쓰는 사람에게만
  // 골라서 깨지는 셈이다. 비율을 유지하도록 같이 곱해준다.
  const { fontScale } = useWindowDimensions();
  const base = type[variant];
  return (
    <RNText
      style={[
        base,
        fontScale !== 1 ? { lineHeight: Math.round(base.lineHeight * fontScale) } : null,
        { color: TONE[kind] },
        style,
      ]}
      {...rest}
    />
  );
}
