import { ActivityIndicator, type PressableProps } from "react-native";

import { T, type Kind } from "./Text";
import { Touchable } from "./Touchable";
import { color, fonts, radius, space } from "./tokens";

/**
 * 버튼은 전부 상자다. 글자만 떠 있으면 누를 수 있는 것인지 알 수 없다.
 *
 *   primary    이 화면에서 하려는 일. 화면당 하나. 채워진 강조색.
 *   secondary  할 수 있는 다른 일. 흰 면 + 진한 테두리.
 *   text       덜 중요한 행동(이의제기, 약관). 강조색 테두리와 글자.
 *   quiet      그냥 나가기(닫기, 취소). 상자 없이 흐린 글자 — 주된 행동과
 *              경쟁하면 안 되는 유일한 경우다.
 *
 * 테두리색이 #8B95A1 인 이유: WCAG 1.4.11 은 버튼 같은 비텍스트 UI 요소에
 * 배경 대비 3.0 을 요구한다. 전에 쓰던 #E5E8EB 는 1.23 이라 흰 배경에
 * 묻혀서 "버튼이 없는 것처럼" 보였다. #8B95A1 은 3.04 다.
 */
type Tone = "primary" | "secondary" | "text" | "quiet";

export const TONE_SURFACE: Record<Tone, Record<string, unknown>> = {
  primary: { backgroundColor: color.accent },
  secondary: { backgroundColor: color.bg, borderWidth: 1, borderColor: color.border },
  text: { backgroundColor: color.bg, borderWidth: 1, borderColor: color.accent },
  quiet: {},
};

export const TONE_LABEL: Record<Tone, Kind> = {
  primary: "text",     // 아래에서 흰색으로 덮는다
  secondary: "text",
  text: "accent",
  quiet: "muted",
};

/** quiet 만 상자가 아니다. */
const BOXED: Record<Tone, boolean> = {
  primary: true,
  secondary: true,
  text: true,
  quiet: false,
};

export function Button({
  label,
  tone = "primary",
  kind,
  disabled,
  loading = false,
  size = "normal",
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  tone?: Tone;
  kind?: Kind;
  /** 처리 중임을 버튼 자리에서 보여준다. 자동으로 다시 눌리지 않게 막는다. */
  loading?: boolean;
  /** 화면에 할 일이 이것뿐일 때 크게 만든다. */
  size?: "normal" | "large";
}) {
  const boxed = BOXED[tone];
  const blocked = disabled || loading;
  const labelKind = kind ?? TONE_LABEL[tone];
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: loading }}
      disabled={blocked}
      style={{
        ...TONE_SURFACE[tone],
        borderRadius: boxed ? radius.button : 0,
        // height 로 고정하면 시스템 글자 크기를 키운 사람에게 라벨이 잘린다.
        minHeight: boxed ? (size === "large" ? 72 : 56) : 44,
        width: boxed ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: boxed ? space.base : space.sm,
        paddingVertical: space.sm,
        opacity: disabled && !loading ? 0.4 : 1,
      }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={tone === "primary" ? "#FFFFFF" : color.accent} />
      ) : (
        <T
          variant={size === "large" ? "title" : "section"}
          kind={labelKind}
          // primary 가 아닐 때 color/fontFamily 를 undefined 로 넘기면 안 된다.
          // RN 은 나중 스타일이 이기므로 kind 가 정한 색이 지워진다.
          style={
            tone === "primary"
              ? { textAlign: "center", color: "#FFFFFF", fontFamily: fonts.BOLD }
              : { textAlign: "center" }
          }
        >
          {label}
        </T>
      )}
    </Touchable>
  );
}
