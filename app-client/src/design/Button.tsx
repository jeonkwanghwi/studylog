import { ActivityIndicator, type PressableProps } from "react-native";

import { T, type Kind } from "./Text";
import { Touchable } from "./Touchable";
import { color, fonts, radius, space } from "./tokens";

/**
 * 네 가지 톤. 각각 "얼마나 중요한 행동인가"를 말한다.
 *
 *   primary    이 화면에서 하려는 일. 화면당 하나.
 *   secondary  할 수 있는 다른 일. 채움 + 윤곽선으로 형태를 만든다.
 *   text       면은 없지만 누르면 뭔가 일어나는 것 (이의제기, 복구하기).
 *   quiet      그냥 나가기 (닫기, 취소). 눈에 덜 띄어야 한다.
 *
 * secondary 에 윤곽선이 필요한 이유: 채움색(#F2F4F6)과 화면 배경(#FFFFFF)의
 * 대비가 1.10 이다. 면만으로는 배경에 묻혀서 버튼이 없는 것처럼 보였다.
 * text 와 quiet 을 가른 이유: 전에는 둘 다 회색 글자여서, 실제로 뭔가를
 * 하는 버튼과 그냥 닫는 버튼이 똑같이 생겼다.
 */
type Tone = "primary" | "secondary" | "text" | "quiet";

export const TONE_SURFACE: Record<Tone, Record<string, unknown>> = {
  primary: { backgroundColor: color.accent },
  secondary: {
    backgroundColor: color.fill,
    borderWidth: 1,
    borderColor: color.fillStrong,
  },
  text: {},
  quiet: {},
};

export const TONE_LABEL: Record<Tone, Kind> = {
  primary: "text",     // 아래에서 흰색으로 덮는다
  secondary: "text",
  text: "accent",      // 누를 수 있다는 신호
  quiet: "muted",
};

const FILLED: Record<Tone, boolean> = {
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
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  tone?: Tone;
  kind?: Kind;
  /** 처리 중임을 버튼 자리에서 보여준다. 자동으로 다시 눌리지 않게 막는다. */
  loading?: boolean;
}) {
  const filled = FILLED[tone];
  const blocked = disabled || loading;
  const labelKind = kind ?? TONE_LABEL[tone];
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: loading }}
      disabled={blocked}
      style={{
        ...TONE_SURFACE[tone],
        borderRadius: filled ? radius.button : 0,
        // height 로 고정하면 시스템 글자 크기를 키운 사람에게 라벨 위아래가 잘린다.
        minHeight: filled ? 56 : 44,
        width: filled ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: filled ? 0 : space.sm,
        paddingVertical: space.sm,
        opacity: disabled && !loading ? 0.4 : 1,
      }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={tone === "primary" ? "#FFFFFF" : color.accent} />
      ) : (
        <T
          variant="section"
          kind={labelKind}
          // primary 가 아닐 때 color/fontFamily 를 undefined 로 넘기면 안 된다.
          // RN 은 나중 스타일이 이기므로, kind 가 정한 색을 undefined 가
          // 덮어써서 글자색이 통째로 날아간다. 실제로 text 톤 버튼이
          // 강조색을 잃고 기본색으로 나오고 있었다.
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
