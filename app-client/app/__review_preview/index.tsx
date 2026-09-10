import { ScrollView, View } from "react-native";

import { Amount } from "../../src/design/Amount";
import { Button } from "../../src/design/Button";
import { Sheet } from "../../src/design/Sheet";
import { T } from "../../src/design/Text";
import { TickStrip } from "../../src/design/TickStrip";
import { color, space } from "../../src/design/tokens";

const longRun = Array.from({ length: 30 }, (_, i) => {
  if (i === 12) return "missed" as const;
  if (i >= 25) return "pending" as const;
  return "secured" as const;
});

export default function ReviewPreview() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.ground }}>
      <View style={{ padding: space.lg, gap: space.lg }}>
        <T variant="title">D-day 12</T>
        <Amount value={-182000} size="display" kind="stamp" />
        <TickStrip days={30} marks={longRun} />

        <Sheet>
          <T variant="body">오늘의 스터디 로그</T>
          <Amount value={18000} />
        </Sheet>

        <Button label="오늘 공부 인증하기" onPress={() => {}} />
        <Button label="자세히 보기" tone="quiet" onPress={() => {}} />
        <Button label="챌린지 포기" tone="danger" onPress={() => {}} />
      </View>
    </ScrollView>
  );
}
