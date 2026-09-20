import { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";

import { T } from "./Text";
import { color, radius, space, type } from "./tokens";

/**
 * 글자를 입력받는 칸.
 *
 * 버튼에서는 테두리를 뺐지만 여기서는 쓴다. 버튼의 테두리는 색을 가진 면
 * 위에 중복으로 얹히는 것이었고, 입력창의 테두리는 **편집할 수 있는 영역의
 * 경계** 라서 구조다. 경계가 없으면 그냥 글자로 보인다 — 실제로 설정 화면의
 * 목표 시간을 바꿀 수 있다는 것을 아무도 몰랐다.
 *
 * 테두리색이 textMuted(#8B95A1, 대비 3.04)인 이유는 WCAG 1.4.11 이 비텍스트
 * UI 요소에 3.0 을 요구하기 때문이다. 새 색을 들이지 않고 기존 토큰을 쓴다.
 */
export function Field({
  label,
  hint,
  suffix,
  big = false,
  style,
  ...rest
}: TextInputProps & {
  label?: string;
  hint?: string;
  /** 단위. "분", "원" 처럼 숫자 뒤에 붙는다. */
  suffix?: string;
  /** 그 화면을 대표하는 숫자일 때. 크게 보여준다. */
  big?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const font = big ? type.hero : type.body;

  return (
    <View style={{ gap: space.sm }}>
      {label ? (
        <T variant="caption" kind="muted">
          {label}
        </T>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: space.sm,
          backgroundColor: color.bg,
          borderRadius: radius.button,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? color.accent : color.border,
          paddingHorizontal: space.base,
          paddingVertical: big ? space.md : space.base,
          // 테두리가 1→2 로 두꺼워질 때 칸이 흔들리지 않게 보정한다.
          margin: focused ? 0 : 1,
        }}
      >
        <TextInput
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={color.textMuted}
          style={[
            {
              flex: 1,
              color: color.text,
              fontFamily: font.fontFamily,
              fontSize: font.fontSize,
              letterSpacing: font.letterSpacing,
              padding: 0,
            },
            style,
          ]}
        />
        {suffix ? (
          <T variant={big ? "title" : "body"} kind="sub">
            {suffix}
          </T>
        ) : null}
      </View>

      {hint ? (
        <T variant="caption" kind="muted">
          {hint}
        </T>
      ) : null}
    </View>
  );
}
