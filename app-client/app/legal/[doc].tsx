import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";

import { Button } from "../../src/design/Button";
import { useScreenPadding } from "../../src/design/safeArea";
import { T } from "../../src/design/Text";
import { color, radius, space } from "../../src/design/tokens";
import { NEEDS_INPUT, PRIVACY, TERMS, type Section } from "../../src/legal/content";

const DOCS: Record<string, { title: string; sections: Section[] }> = {
  terms: { title: "이용약관", sections: TERMS },
  privacy: { title: "개인정보처리방침", sections: PRIVACY },
};

/** 아직 채우지 않은 자리는 눈에 띄게 둔다 — 조용히 넘어가면 그대로 제출된다. */
function Line({ text }: { text: string }) {
  if (!text.includes(NEEDS_INPUT)) {
    return (
      <T variant="body" kind="sub">
        {text}
      </T>
    );
  }
  const [before, after] = text.split(NEEDS_INPUT);
  return (
    <T variant="body" kind="sub">
      {before}
      <T variant="body" kind="negative">
        {NEEDS_INPUT}
      </T>
      {after}
    </T>
  );
}

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const screenPadding = useScreenPadding();
  const entry = DOCS[doc ?? ""];

  if (!entry) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg }}>
        <T variant="title">없는 문서입니다</T>
        <Button label="닫기" tone="quiet" onPress={() => router.back()} />
      </View>
    );
  }

  const incomplete = entry.sections.some((s) =>
    s.body.some((line) => line.includes(NEEDS_INPUT))
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, ...screenPadding }}>
      <T variant="title">{entry.title}</T>

      {incomplete && (
        <View
          style={{
            backgroundColor: color.negativeSoft,
            borderRadius: radius.card,
            padding: space.base,
          }}
        >
          <T variant="caption" kind="negative">
            아직 작성 중인 문서입니다. 붉게 표시된 항목은 출시 전에 채웁니다.
          </T>
        </View>
      )}

      {entry.sections.map((section) => (
        <View key={section.heading} style={{ gap: space.sm }}>
          <T variant="section">{section.heading}</T>
          {section.body.map((line, i) => (
            <Line key={i} text={line} />
          ))}
        </View>
      ))}

      <Button label="닫기" tone="quiet" onPress={() => router.back()} />
    </ScrollView>
  );
}
