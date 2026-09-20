import { ActivityIndicator, type PressableProps } from "react-native";

import { T, type Kind } from "./Text";
import { Touchable } from "./Touchable";
import { color, fonts, radius, space } from "./tokens";

/**
 * 무게가 세 단계다. 전부 상자로 만들면 위계가 사라진다.
 *
 *   primary    이 화면에서 하려는 일. 화면당 하나. 채워진 강조색.
 *   secondary  할 수 있는 다른 일. 강조색의 옅은 면 + 강조색 글자.
 *   text       덜 중요한 행동(이의제기, 약관). 강조색 글자만.
 *   quiet      그냥 나가기(닫기, 취소). 흐린 글자만.
 *
 * secondary 가 중립 회색이 아니라 강조색 계열인 이유: 회색 채움(#F2F4F6)은
 * 흰 배경 대비 1.10 이라 버튼이 없는 것처럼 보였다. 회색 테두리를 두르는
 * 방법도 있지만 그러면 화면이 와이어프레임처럼 되고, 무엇보다 모든 버튼이
 * 같은 무게가 되어 위계가 사라진다.
 */
type Tone = "primary" | "secondary" | "text" | "quiet";

export const TONE_SURFACE: Record<Tone, Record<string, unknown>> = {
  primary: { backgroundColor: color.accent },
  secondary: { backgroundColor: color.accentFill },
  text: {},
  quiet: {},
};

/** 누르고 있는 동안. 크기만 변하면 "눌렀다"는 느낌이 약하다. */
const TONE_PRESSED: Record<Tone, Record<string, unknown>> = {
  primary: { backgroundColor: color.accentPressed },
  secondary: { backgroundColor: color.accentFillPressed },
  text: { opacity: 0.6 },
  quiet: { opacity: 0.6 },
};

export const TONE_LABEL: Record<Tone, Kind> = {
  primary: "text",     // 아래에서 흰색으로 덮는다
  secondary: "accent",
  text: "accent",
  quiet: "muted",
};

/** 면을 가진 것만 상자다. */
const BOXED: Record<Tone, boolean> = {
  primary: true,
  secondary: true,
  text: false,
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
        ...(blocked && boxed ? { backgroundColor: color.disabledFill } : {}),
        borderRadius: boxed ? radius.button : 0,
        // height 로 고정하면 시스템 글자 크기를 키운 사람에게 라벨이 잘린다.
        minHeight: boxed ? (size === "large" ? 72 : 56) : 44,
        width: boxed ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: boxed ? space.base : space.sm,
        paddingVertical: space.sm,
      }}
      // 비활성은 투명도로 흐리게 만들지 않는다 — 흐린 것과 "안 눌리는 것"은
      // 다른 뜻이고, 흐린 라벨은 읽기도 어렵다. 고유한 면과 글자색으로 말한다.
      pressedStyle={blocked ? undefined : (TONE_PRESSED[tone] as never)}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={tone === "primary" ? "#FFFFFF" : color.accent} />
      ) : (
        <T
          variant={size === "large" ? "title" : "button"}
          kind={blocked ? "muted" : labelKind}
          // primary 가 아닐 때 color/fontFamily 를 undefined 로 넘기면 안 된다.
          // RN 은 나중 스타일이 이기므로 kind 가 정한 색이 지워진다.
          style={
            blocked
              ? { textAlign: "center" }
              : tone === "primary"
                ? { textAlign: "center", color: "#FFFFFF", fontFamily: fonts.BOLD }
                : tone === "secondary"
                  ? { textAlign: "center", fontFamily: fonts.BOLD }
                  : { textAlign: "center" }
          }
        >
          {label}
        </T>
      )}
    </Touchable>
  );
}
