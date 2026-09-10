import { Pressable, type PressableProps } from "react-native";

import { T } from "./Text";
import { color, fonts, radius } from "./tokens";

type Tone = "primary" | "secondary" | "text";

const BACKGROUND: Record<Tone, string> = {
  primary: color.accent,
  secondary: color.fill,
  text: "transparent",
};

const LABEL_KIND: Record<Tone, "text" | "sub"> = {
  primary: "text",
  secondary: "text",
  text: "sub",
};

export function Button({
  label,
  tone = "primary",
  disabled,
  ...rest
}: PressableProps & { label: string; tone?: Tone }) {
  const filled = tone === "primary" || tone === "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: BACKGROUND[tone],
        borderRadius: filled ? radius.button : 0,
        height: filled ? 56 : 44,
        width: filled ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
      {...rest}
    >
      <T
        variant="section"
        kind={LABEL_KIND[tone]}
        style={{
          textAlign: "center",
          color: tone === "primary" ? "#FFFFFF" : undefined,
          fontFamily: tone === "primary" ? fonts.BOLD : undefined,
        }}
      >
        {label}
      </T>
    </Pressable>
  );
}
