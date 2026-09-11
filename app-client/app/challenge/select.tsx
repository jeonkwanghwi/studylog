import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";

import { ApiError, api } from "../../src/api/client";
import { useCurrentChallenge, useInvalidateAll, useMe, useProducts } from "../../src/api/hooks";
import type { ChallengeProductOut } from "../../src/api/types";
import { Amount } from "../../src/design/Amount";
import { Button } from "../../src/design/Button";
import { Card } from "../../src/design/Card";
import { T } from "../../src/design/Text";
import { color, space } from "../../src/design/tokens";
import { formatWon } from "../../src/money/format";
import { buyProduct, initPurchases } from "../../src/purchases/revenuecat";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

export default function Select() {
  const products = useProducts();
  const me = useMe();
  const invalidate = useInvalidateAll();
  const challenge = useCurrentChallenge();
  const [busy, setBusy] = useState<string | null>(null);
  // 결제는 스토어에서 바로 끝나도, 챌린지는 RevenueCat 웹훅이 서버에 닿아야
  // 열린다. 그 사이 유저를 화면에서 내보내거나 버튼을 다시 누르게 두면, 서버는
  // 이미 활성 챌린지가 있다는 이유로 두 번째 결제의 챌린지는 열어주지 않고
  // 영수증만 남긴다 — 돈만 조용히 사라진다. 그래서 챌린지가 나타날 때까지
  // 여기 붙잡아 두고, 한 번 성공한 뒤로는 절대 구매 버튼을 다시 켜지 않는다.
  const [confirming, setConfirming] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const balance = me.data?.credit_balance ?? 0;
  const userId = me.data?.id;

  // RevenueCat 의 appUserID 는 반드시 우리 서버의 user.id 와 같아야 한다.
  // 웹훅이 그 id 로 유저를 찾기 때문에, 결제 전에 항상 다시 맞춰둔다.
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        await initPurchases(userId);
      } catch (error) {
        Alert.alert("결제 준비 실패", (error as Error).message);
      }
    })();
  }, [userId]);

  // 폴링 중이든, 타임아웃 뒤 수동 새로고침이든 — 챌린지가 나타나는 순간 나간다.
  useEffect(() => {
    if (confirming && challenge.data) router.back();
  }, [confirming, challenge.data]);

  useEffect(() => {
    if (!confirming || timedOut || challenge.data) return;
    const start = Date.now();
    const id = setInterval(() => {
      if (Date.now() - start >= POLL_TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      challenge.refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [confirming, timedOut, challenge.data]);

  async function payWithStore(product: ChallengeProductOut) {
    setBusy(product.product_id);
    try {
      await buyProduct(product.product_id);
      // 서버에 알리지 않는다. RevenueCat 웹훅이 챌린지를 연다. 다만 웹훅이
      // 아직 도착하지 않았을 수 있으니, 나타날 때까지 이 화면에서 기다린다.
      await invalidate();
      setConfirming(true);
    } catch (error) {
      Alert.alert("결제 실패", (error as Error).message);
      setBusy(null);
    }
  }

  async function payWithCredit(product: ChallengeProductOut) {
    setBusy(product.product_id);
    try {
      await api.post("/challenges", { product_id: product.product_id });
      await invalidate();
      router.back();
    } catch (error) {
      const detail =
        error instanceof ApiError ? error.detail : "참가하지 못했습니다.";
      Alert.alert("참가 실패", detail);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, paddingTop: space.huge, gap: space.base }}
    >
      <T variant="body" kind="sub">
        참가비를 먼저 내고, 목표를 채운 날마다 하루치를 크레딧으로 돌려받습니다.
      </T>

      {confirming && (
        <Card style={{ gap: space.sm }}>
          {timedOut ? (
            <>
              <T variant="section">결제가 완료됐습니다</T>
              <T variant="body" kind="sub">
                챌린지가 열리기까지 시간이 조금 더 걸리고 있어요. 곧 나타납니다 — 화면을
                나가지 말고 새로고침해보세요.
              </T>
              <Button label="새로고침" tone="secondary" onPress={() => challenge.refetch()} />
            </>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <ActivityIndicator color={color.accent} />
              <T variant="body" kind="sub">
                결제를 확인하는 중입니다…
              </T>
            </View>
          )}
        </Card>
      )}

      {(products.data ?? []).map((product) => (
        <Card key={product.product_id} style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <T variant="section">{product.days}일</T>
            <Amount value={product.price} size="amount" />
          </View>
          <T variant="caption" kind="muted">
            하루 {formatWon(product.daily_payback)}씩 돌려받음
            {product.completion_bonus > 0 &&
              ` · 완주 시 ${formatWon(product.completion_bonus)} 추가`}
          </T>

          <Button
            label="결제하고 시작"
            tone="primary"
            disabled={busy !== null}
            onPress={() => payWithStore(product)}
          />

          {balance >= product.price && (
            <Button
              label="크레딧으로 참가"
              tone="secondary"
              disabled={busy !== null}
              onPress={() => payWithCredit(product)}
            />
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
