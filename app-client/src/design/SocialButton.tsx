import { ActivityIndicator, View } from "react-native";

import { T } from "./Text";
import { Touchable } from "./Touchable";
import { fonts, radius } from "./tokens";

/**
 * 소셜 로그인 버튼은 우리 디자인이 아니라 각 사의 브랜드 규정을 따른다.
 *
 * 색·문구를 임의로 바꾸면 심사에서 반려된다. Apple 은 자사 버튼 컴포넌트를
 * 쓰므로 여기서 다루지 않고, 카카오·구글만 여기서 규정대로 그린다.
 */
type Brand = "kakao" | "google";

const STYLE: Record<Brand, { bg: string; fg: string; border?: string; label: string }> = {
  // 카카오 규정: #FEE500 배경, 검정 85% 글자, 문구는 "카카오 로그인"
  kakao: { bg: "#FEE500", fg: "rgba(0,0,0,0.85)", label: "카카오 로그인" },
  // 구글 규정: 흰 배경 + 회색 테두리, 문구는 "Google 계정으로 로그인"
  google: { bg: "#FFFFFF", fg: "#1F1F1F", border: "#747775", label: "Google 계정으로 로그인" },
};

export function SocialButton({
  brand,
  onPress,
  disabled,
  loading = false,
  symbol,
}: {
  brand: Brand;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** 각 사 공식 심볼. 아직 에셋이 없으면 비워둔다 — 심사 전에 반드시 채운다. */
  symbol?: React.ReactNode;
}) {
  const s = STYLE[brand];
  const blocked = disabled || loading;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={s.label}
      accessibilityState={{ disabled: !!blocked, busy: loading }}
      disabled={blocked}
      style={{
        backgroundColor: s.bg,
        borderRadius: radius.button,
        borderWidth: s.border ? 1 : 0,
        borderColor: s.border,
        minHeight: 56,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled && !loading ? 0.4 : 1,
      }}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={s.fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {symbol}
          <T variant="section" style={{ color: s.fg, fontFamily: fonts.MEDIUM }}>
            {s.label}
          </T>
        </View>
      )}
    </Touchable>
  );
}
