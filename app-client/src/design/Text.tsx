import { Text as RNText, type TextProps } from "react-native";

import { color, type } from "./tokens";

type Variant = keyof typeof type;
type Kind = "ink" | "muted" | "stamp";

const TONE: Record<Kind, string> = {
  ink: color.ink,
  muted: color.inkMuted,
  stamp: color.stamp,
};

export function T({
  variant = "body",
  kind = "ink",
  style,
  ...rest
}: TextProps & { variant?: Variant; kind?: Kind }) {
  return <RNText style={[type[variant], { color: TONE[kind] }, style]} {...rest} />;
}
