import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { ApiError, api } from "../../src/api/client";
import { useCurrentChallenge, useMe } from "../../src/api/hooks";
import { useAuth } from "../../src/auth/useAuth";
import { BackButton } from "../../src/design/BackButton";
import { Button } from "../../src/design/Button";
import { haptic } from "../../src/design/motion";
import { useScreenPadding } from "../../src/design/safeArea";
import { T } from "../../src/design/Text";
import { Touchable } from "../../src/design/Touchable";
import { color, radius, space } from "../../src/design/tokens";
import { formatWon } from "../../src/money/format";

/**
 * 회원 탈퇴 확인.
 *
 * 경고 한 줄짜리 Alert 으로 처리하지 않는다. 되돌릴 수 없고, 실제로 돈을
 * 주고 산 크레딧이 사라지기 때문이다. 사라지는 것을 **그 사람의 실제
 * 숫자로** 보여주고, 읽었다는 표시를 받은 뒤에야 버튼이 열린다.
 */
export default function DeleteAccount() {
  const screenPadding = useScreenPadding();
  const me = useMe();
  const challenge = useCurrentChallenge();
  const { signOut } = useAuth();
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const balance = me.data?.credit_balance ?? 0;
  const active = challenge.data;

  async function remove() {
    setDeleting(true);
    setFailed(null);
    try {
      await api.del("/users/me");
      haptic.success();
      // 서버에서 사라진 계정의 토큰을 들고 있을 이유가 없다.
      await signOut();
      router.replace("/login");
    } catch (error) {
      haptic.warning();
      setFailed(
        error instanceof ApiError && error.kind !== "other"
          ? error.detail
          : "탈퇴하지 못했습니다. 잠시 후 다시 시도해주세요."
      );
      setDeleting(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: space.xl, gap: space.lg, ...screenPadding }}>
      {!deleting && <BackButton label="취소" />}

      <T variant="title">정말 탈퇴하시겠어요?</T>
      <T variant="body" kind="sub">
        탈퇴하면 아래 내용이 모두 사라집니다. 되돌릴 수 없습니다.
      </T>

      <View
        style={{
          backgroundColor: color.negativeSoft,
          borderRadius: radius.card,
          padding: space.base,
          gap: space.sm,
        }}
      >
        {balance > 0 && (
          <T variant="body" kind="negative">
            크레딧 {formatWon(balance)}이 소멸합니다. 현금으로 돌려받을 수 없습니다.
          </T>
        )}
        {active && (
          <T variant="body" kind="negative">
            진행 중인 {active.total_days}일 챌린지가 종료되고, 남은 날의 페이백을
            받을 수 없습니다.
          </T>
        )}
        <T variant="body" kind="negative">
          인증 사진과 모든 기록이 지워집니다.
        </T>
      </View>

      <T variant="caption" kind="muted">
        환불·분쟁 대응을 위해 결제 영수증 번호만 남습니다. 누구의 결제였는지는
        지워지므로 이 기록으로 회원님을 찾을 수 없습니다.
      </T>

      {/* 읽었다는 표시를 받기 전에는 버튼이 열리지 않는다. */}
      <Touchable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acknowledged }}
        disabled={deleting}
        onPress={() => setAcknowledged((v) => !v)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          minHeight: 44,
        }}
      >
        <Ionicons
          name={acknowledged ? "checkbox" : "square-outline"}
          size={24}
          color={acknowledged ? color.accent : color.textMuted}
        />
        <T variant="body" style={{ flexShrink: 1 }}>
          위 내용을 확인했습니다
        </T>
      </Touchable>

      {failed && (
        <T variant="body" kind="negative">
          {failed}
        </T>
      )}

      {deleting ? (
        <ActivityIndicator color={color.accent} />
      ) : (
        <Button
          label="탈퇴하기"
          tone="danger"
          disabled={!acknowledged}
          onPress={remove}
        />
      )}
    </View>
  );
}
