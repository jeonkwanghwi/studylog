import { Pressable, type PressableProps } from "react-native";

import { T } from "./Text";
import { color, radius, space } from "./tokens";

type Tone = "primary" | "quiet" | "danger";

export function Button({
  label,
  tone = "primary",
  disabled,
  ...rest
}: PressableProps & { label: string; tone?: Tone }) {
  const filled = tone === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: filled ? color.ink : "transparent",
        borderWidth: filled ? 0 : 1,
        borderColor: tone === "danger" ? color.stamp : color.line,
        borderRadius: radius.button,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
      {...rest}
    >
      <T
        variant="body"
        kind={filled ? "ink" : tone === "danger" ? "stamp" : "ink"}
        style={{
          textAlign: "center",
          color: filled ? color.paper : undefined,
        }}
      >
        {label}
      </T>
    </Pressable>
  );
}
