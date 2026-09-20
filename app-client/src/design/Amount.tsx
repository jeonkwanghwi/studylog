import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";

import { motion, useReducedMotion } from "./motion";
import { T } from "./Text";
import { color, space } from "./tokens";

type Size = "hero" | "amount";
type Kind = "text" | "sub" | "muted" | "accent" | "negative";

const UNIT_VARIANT: Record<Size, "title" | "caption"> = {
  hero: "title",
  amount: "caption",
};

/**
 * 값이 바뀌면 그 차이만큼 숫자가 굴러간다. 처음 그릴 때는 굴리지 않는다.
 *
 * 화면에 들어올 때마다 0에서 세면 금방 지겨워지고, 매번 봐야 하는 잔액을
 * 읽는 데 방해만 된다. 돈이 실제로 움직인 순간에만 움직여야 의미가 있다.
 */
function useRollingValue(value: number, enabled: boolean): number {
  const reduced = useReducedMotion();
  const animated = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!enabled || reduced || !mounted.current) {
      mounted.current = true;
      animated.setValue(value);
      setShown(value);
      return;
    }
    const sub = animated.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(animated, {
      toValue: value,
      duration: motion.count.duration,
      useNativeDriver: false, // 숫자를 읽어야 하므로 JS 스레드에서 돌려야 한다
    }).start(() => setShown(value));
    return () => animated.removeListener(sub);
  }, [value, enabled, reduced, animated]);

  return shown;
}

/** 금액. 숫자는 hero/amount, 단위 '원'은 별도 노드로 뒤에 붙인다. '₩'는 쓰지 않는다. */
export function Amount({
  value,
  size = "amount",
  kind = "text",
  roll = false,
  onDark = false,
}: {
  value: number;
  size?: Size;
  kind?: Kind;
  /** 어두운 면 위. 챌린지 화면이 그렇다. */
  onDark?: boolean;
  /** 값이 바뀔 때 숫자를 굴린다. 돈이 실제로 움직이는 자리에만 켠다. */
  roll?: boolean;
}) {
  const shown = useRollingValue(value, roll);
  const sign = shown < 0 ? "-" : "";
  const tone = onDark ? { color: color.inkText } : undefined;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
      <T variant={size} kind={kind} style={tone}>
        {sign}
        {Math.abs(shown).toLocaleString("ko-KR")}
      </T>
      <T variant={UNIT_VARIANT[size]} kind={kind} style={tone}>
        원
      </T>
    </View>
  );
}
