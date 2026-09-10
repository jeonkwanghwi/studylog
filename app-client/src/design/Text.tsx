import { Text as RNText, type TextProps } from "react-native";

import { color, type } from "./tokens";

type Variant = keyof typeof type;
type Kind = "text" | "sub" | "muted" | "accent" | "negative";

const TONE: Record<Kind, string> = {
  text: color.text,
  sub: color.textSub,
  muted: color.textMuted,
  accent: color.accent,
  negative: color.negative,
};

export function T({
  variant = "body",
  kind = "text",
  style,
  ...rest
}: TextProps & { variant?: Variant; kind?: Kind }) {
  return <RNText style={[type[variant], { color: TONE[kind] }, style]} {...rest} />;
}
