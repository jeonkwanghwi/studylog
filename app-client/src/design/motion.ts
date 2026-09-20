import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

/**
 * 동작 토큰. 값 하나하나가 의미를 갖는다.
 *
 * 누르는 반응은 빠를수록 "내 손가락이 눌렀다"고 느껴지고, 결과를 보여주는
 * 등장은 조금 느려야 읽힌다. 그래서 둘을 다른 값으로 둔다.
 */
export const motion = {
  /** 누름 → 축소. 손가락보다 빨라야 한다. */
  pressIn: { duration: 90 },
  /** 뗌 → 복귀. 살짝 튕겨야 기계적으로 안 보인다. */
  pressOut: { friction: 5, tension: 320 },
  /** 화면 요소 등장 */
  enter: { duration: 260, easing: Easing.bezier(0.2, 0, 0, 1) },
  /** 숫자가 올라가는 시간 */
  count: { duration: 700 },
  /** 눌렀을 때 줄어드는 정도. 0.95 아래로 내려가면 과장돼 보인다. */
  pressScale: 0.96,
  /** 누름 상태의 색 전환. 고빈도 상호작용이라 150ms 를 넘기면 굼떠 보인다. */
  pressFade: { duration: 120 },
} as const;

/**
 * 시스템의 "동작 줄이기"를 켠 사람에게는 애니메이션을 주지 않는다.
 * 전정기관 장애가 있는 사람에게 스케일·슬라이드는 실제로 멀미를 일으킨다.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduced(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** 누르면 살짝 줄어들었다가 튕겨 돌아오는 반응. 모든 누를 수 있는 것에 붙인다. */
export function usePressScale() {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  return {
    scale,
    onPressIn: () => {
      if (reduced) return;
      Animated.timing(scale, {
        toValue: motion.pressScale,
        duration: motion.pressIn.duration,
        useNativeDriver: true,
      }).start();
    },
    onPressOut: () => {
      if (reduced) return;
      Animated.spring(scale, {
        toValue: 1,
        ...motion.pressOut,
        useNativeDriver: true,
      }).start();
    },
  };
}

/** 마운트될 때 아래에서 살짝 올라오며 나타난다. 결과를 보여주는 순간에만 쓴다. */
export function useEnter(offset = 12) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      ...motion.enter,
      useNativeDriver: true,
    }).start();
  }, [progress, reduced]);

  return {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }),
      },
    ],
  };
}

/**
 * 햅틱. 실패해도 조용히 넘어간다 — 진동이 안 된다고 앱이 멈추면 안 된다.
 *
 * 종류를 함부로 늘리지 않는다. 누를 때는 가볍게, 결과가 나올 때만 성공/실패로
 * 구분한다. 모든 동작이 다르게 진동하면 아무 의미도 전달되지 않는다.
 */
export const haptic = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};
