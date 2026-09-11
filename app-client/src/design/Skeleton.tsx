import { useEffect, useRef } from "react";
import { Animated, View, type DimensionValue } from "react-native";

import { useReducedMotion } from "./motion";
import { color, radius, space } from "./tokens";

/**
 * 로딩 자리표시자. 빈 화면 가운데 스피너 대신, 곧 올 내용의 모양을 미리 그린다.
 *
 * 스피너는 "기다려라"만 말하고 끝나면 화면이 통째로 튄다. 같은 자리에 같은
 * 크기로 자리를 잡아두면 내용이 도착해도 레이아웃이 움직이지 않는다.
 */
export function Skeleton({
  width = "100%",
  height = 20,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  style?: object;
}) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  return (
    <Animated.View
      testID="skeleton"
      style={[
        {
          width,
          height,
          borderRadius: radius.chip,
          backgroundColor: color.fill,
          opacity: reduced ? 0.7 : pulse,
        },
        style,
      ]}
    />
  );
}

/** 홈·기록 화면이 기다리는 동안 쓰는 기본 형태: 제목 한 줄, 큰 숫자, 카드 하나. */
export function ScreenSkeleton() {
  return (
    <View style={{ padding: space.lg, paddingTop: space.huge, gap: space.xl }}>
      <View style={{ gap: space.md }}>
        <Skeleton width={96} height={16} />
        <Skeleton width={200} height={38} />
      </View>
      <Skeleton height={132} style={{ borderRadius: radius.card }} />
      <Skeleton height={56} style={{ borderRadius: radius.button }} />
    </View>
  );
}

/** 카드가 줄줄이 오는 화면(기록·피드)이 기다리는 동안 쓰는 형태. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ padding: space.lg, paddingTop: space.huge, gap: space.md }}>
      <Skeleton width={64} height={28} style={{ marginBottom: space.sm }} />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={92} style={{ borderRadius: radius.card }} />
      ))}
    </View>
  );
}
