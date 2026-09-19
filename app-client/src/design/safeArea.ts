import { useSafeAreaInsets } from "react-native-safe-area-context";

import { space } from "./tokens";

/**
 * 화면 위아래 여백. 고정값을 쓰면 안 된다.
 *
 * 전에는 paddingTop 이 48로 박혀 있었는데, 노치가 있는 아이폰의 상단
 * 안전영역은 그보다 크다. 그래서 첫 줄이 상태바와 카메라에 거의 닿았다.
 * 기기마다 다른 값이라 실기기에서만 드러난다.
 *
 * 아래쪽은 홈 인디케이터를 피한다 — 탭이 있는 화면은 탭바가 이미 자리를
 * 차지하므로 inset 이 0으로 들어온다.
 */
export function useScreenPadding() {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: insets.top + space.lg,
    paddingBottom: insets.bottom + space.lg,
  };
}
