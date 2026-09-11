import { ActivityIndicator, type PressableProps } from "react-native";

import { T, type Kind } from "./Text";
import { Touchable } from "./Touchable";
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
  kind,
  disabled,
  loading = false,
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  tone?: Tone;
  kind?: Kind;
  /** 처리 중임을 버튼 자리에서 보여준다. 자동으로 다시 눌리지 않게 막는다. */
  loading?: boolean;
}) {
  const filled = tone === "primary" || tone === "secondary";
  const blocked = disabled || loading;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: loading }}
      disabled={blocked}
      style={{
        backgroundColor: BACKGROUND[tone],
        borderRadius: filled ? radius.button : 0,
        height: filled ? 56 : 44,
        width: filled ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled && !loading ? 0.4 : 1,
      }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={tone === "primary" ? "#FFFFFF" : color.accent} />
      ) : (
        <T
          variant="section"
          kind={kind ?? LABEL_KIND[tone]}
          style={{
            textAlign: "center",
            color: tone === "primary" ? "#FFFFFF" : undefined,
            fontFamily: tone === "primary" ? fonts.BOLD : undefined,
          }}
        >
          {label}
        </T>
      )}
    </Touchable>
  );
}
