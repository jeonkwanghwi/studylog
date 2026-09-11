import type { ReactNode } from "react";
import { Animated, type ViewStyle } from "react-native";

import { useEnter } from "./motion";

/**
 * 마운트될 때 살짝 올라오며 나타난다.
 *
 * 아무 데나 붙이면 화면 전체가 들썩여서 오히려 싸구려로 보인다. 유저가
 * 행동한 결과가 처음 나타나는 자리 — 판정 결과, 이의제기 답 — 에만 쓴다.
 */
export function Appear({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const enter = useEnter();
  return <Animated.View style={[style, enter]}>{children}</Animated.View>;
}
