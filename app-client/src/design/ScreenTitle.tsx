import { View } from "react-native";

import { T } from "./Text";
import { space } from "./tokens";

/**
 * 화면 맨 위. 탭 네 개가 각자 다르게 시작하고 있었다 — 홈은 타이틀이
 * 아예 없어서 어느 화면인지 알 수 없었고, 나머지는 제목 한 줄만 덜렁
 * 있었다. 제목과 한 줄 설명을 한 자리에 모아 규칙을 하나로 만든다.
 *
 * subtitle 은 없으면 그냥 빠진다 — 설명할 게 없는 화면에 억지로
 * 한 줄을 지어 넣지 않는다.
 */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <T variant="title">{title}</T>
      {subtitle ? (
        <T variant="body" kind="sub">
          {subtitle}
        </T>
      ) : null}
    </View>
  );
}
