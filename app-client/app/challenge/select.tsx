import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

import { ApiError, api } from "../../src/api/client";
import { useInvalidateAll, useMe, useProducts } from "../../src/api/hooks";
import type { ChallengeProductOut } from "../../src/api/types";
import { Amount } from "../../src/design/Amount";
import { Button } from "../../src/design/Button";
import { Card } from "../../src/design/Card";
import { T } from "../../src/design/Text";
import { space } from "../../src/design/tokens";
import { formatWon } from "../../src/money/format";
import { buyProduct, initPurchases } from "../../src/purchases/revenuecat";

export default function Select() {
  const products = useProducts();
  const me = useMe();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState<string | null>(null);

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

  async function payWithStore(product: ChallengeProductOut) {
    setBusy(product.product_id);
    try {
      await buyProduct(product.product_id);
      // 서버에 알리지 않는다. RevenueCat 웹훅이 챌린지를 연다.
      await invalidate();
      router.back();
    } catch (error) {
      Alert.alert("결제 실패", (error as Error).message);
    } finally {
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
