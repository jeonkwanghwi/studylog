import { View } from "react-native";

import { Button } from "./Button";
import { T } from "./Text";
import { space } from "./tokens";

/**
 * 조회 실패를 "아무것도 없음"으로 보여주면 안 된다.
 *
 * `data ?? []` 는 실패한 응답과 진짜 빈 목록을 구분하지 못한다. 기록이 있는
 * 사람에게 "아직 기록이 없습니다"라고 말하는 것은 단순한 지연이 아니라
 * 거짓말이고, 돈이 걸린 화면에서는 잘못된 판단을 부른다.
 */
/** 받침이 있으면 "을", 없으면 "를". 한글 음절의 마지막 자모로 판별한다. */
function objectParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  if (!isHangul) return "을(를)";
  return (last - 0xac00) % 28 === 0 ? "를" : "을";
}

export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
      <T variant="title">
        {what}
        {objectParticle(what)} 불러오지 못했습니다
      </T>
      <T variant="body" kind="sub">
        연결을 확인하고 다시 시도해주세요.
      </T>
      <Button label="다시 시도" tone="primary" onPress={onRetry} />
    </View>
  );
}
