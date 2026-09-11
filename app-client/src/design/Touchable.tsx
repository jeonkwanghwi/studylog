import type { ReactNode } from "react";
import { Animated, Pressable, type PressableProps, type ViewStyle } from "react-native";

import { haptic, usePressScale } from "./motion";

type Props = Omit<PressableProps, "style" | "children"> & {
  style?: ViewStyle;
  children?: ReactNode;
  /** 화면을 바꾸지 않는 가벼운 토글에는 꺼도 된다. */
  feedback?: boolean;
};

/**
 * 누를 수 있는 모든 것의 기본. 눌리면 줄어들고, 뗄 때 튕겨 돌아오고, 가볍게 진동한다.
 *
 * opacity 만 낮추는 것과 크게 다르다 — 투명도는 "비활성" 신호로도 읽히지만,
 * 눌려 들어가는 움직임은 오직 "지금 내가 눌렀다"로만 읽힌다.
 */
export function Touchable({
  style,
  children,
  feedback = true,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const press = usePressScale();
  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e) => {
        press.onPressIn();
        if (feedback) haptic.tap();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.onPressOut();
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale: press.scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
