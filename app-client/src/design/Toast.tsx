import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";

import { useReducedMotion } from "./motion";
import { T } from "./Text";
import { color, radius, space } from "./tokens";

const VISIBLE_MS = 1600;

/**
 * 잠깐 떴다 사라지는 확인 메시지.
 *
 * "복사됨" 같은 사소한 확인에 시스템 Alert 를 띄우면 화면을 막고 확인 탭을
 * 한 번 더 요구한다. 되돌릴 일도 없고 놓쳐도 그만인 말은 이렇게 지나가야 한다.
 * 실패나 결제처럼 유저가 반드시 읽어야 하는 것에는 쓰지 않는다.
 */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  // hide 는 Toast 의 effect 의존성이다. 매 렌더 새 함수를 주면 부모가 다시
  // 그릴 때마다 사라지는 애니메이션이 처음부터 다시 시작된다.
  const hide = useCallback(() => setMessage(null), []);
  return { message, show: setMessage, hide };
}

export function Toast({ message, onHide }: { message: string | null; onHide: () => void }) {
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (message === null) return;
    if (reduced) {
      fade.setValue(1);
      const id = setTimeout(onHide, VISIBLE_MS);
      return () => clearTimeout(id);
    }
    const run = Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(VISIBLE_MS),
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]);
    run.start(({ finished }) => finished && onHide());
    return () => run.stop();
  }, [message, reduced, fade, onHide]);

  if (message === null) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: space.lg,
        right: space.lg,
        bottom: space.xxl,
        opacity: fade,
        transform: [
          { translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
        ],
      }}
    >
      <View
        style={{
          backgroundColor: color.text,
          borderRadius: radius.button,
          paddingVertical: space.md,
          paddingHorizontal: space.base,
          alignItems: "center",
        }}
      >
        <T variant="body" style={{ color: color.bg }}>
          {message}
        </T>
      </View>
    </Animated.View>
  );
}
