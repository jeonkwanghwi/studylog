import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { useCurrentChallenge, useCurrentSession, useMe } from "../../src/api/hooks";
import { Amount } from "../../src/design/Amount";
import { Button } from "../../src/design/Button";
import { Card } from "../../src/design/Card";
import { DayGrid } from "../../src/design/DayGrid";
import { T } from "../../src/design/Text";
import { space } from "../../src/design/tokens";
import { formatWon } from "../../src/money/format";
import { elapsedMinutes, formatElapsed, remainingBeforeForfeit } from "../../src/time/elapsed";
import { studyDayOf } from "../../src/time/studyDay";

const WARN_UNDER_MINUTES = 30;

function monthLabel(dateISO: string): string {
  return `${Number(dateISO.slice(5, 7))}월`;
}

export default function Home() {
  const me = useMe();
  const session = useCurrentSession();
  const challenge = useCurrentChallenge();

  // 화면 표시용 재계산일 뿐이다 — 경과 시간의 근거는 서버가 준 started_at 뿐이고,
  // 이 컴포넌트는 매초 다시 그리기 위해 now 만 갱신한다.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // open 만 진행 중인 세션이다. abandoned·closed 는 시작 전 상태로 취급한다.
  const open = session.data?.status === "open" ? session.data : null;
  const activeChallenge = challenge.data ?? null;
  const earned = me.data?.credit_balance ?? 0;
  const remainingAtStake = activeChallenge
    ? Math.max(0, activeChallenge.entry_amount - earned)
    : 0;
  const remaining = open ? remainingBeforeForfeit(open.started_at, now) : 0;

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.huge, gap: space.xl }}>
      <T variant="body" kind="sub">
        {me.data?.nickname ?? ""}님 · {me.data?.streak_count ?? 0}일째 이어가는 중
      </T>

      {activeChallenge ? (
        <View style={{ gap: space.sm }}>
          <T variant="caption" kind="muted">
            아직 못 받은 돈
          </T>
          <Amount value={remainingAtStake} size="hero" />
          <T variant="caption" kind="muted">
            {activeChallenge.total_days}일 챌린지 · {formatWon(earned)} 확보
          </T>
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <T variant="body" kind="sub">
            챌린지를 시작하면 매일 공부한 만큼 돌려받아요
          </T>
          <Button
            label="챌린지 시작"
            tone="secondary"
            onPress={() => router.push("/challenge/select")}
          />
        </View>
      )}

      {activeChallenge && (
        <Card style={{ gap: space.md }}>
          <T variant="section">{monthLabel(studyDayOf(now))}</T>
          <DayGrid
            start={activeChallenge.started_on}
            days={activeChallenge.total_days}
            marks={Array(activeChallenge.total_days).fill("pending")}
            today={studyDayOf(now)}
          />
        </Card>
      )}

      {open ? (
        <View style={{ gap: space.base }}>
          <T variant="hero">{formatElapsed(elapsedMinutes(open.started_at, now))}</T>
          {remaining <= WARN_UNDER_MINUTES && (
            <T variant="caption" kind="negative">
              {remaining}분 뒤 자동 폐기됩니다. 종료 샷을 찍으세요.
            </T>
          )}
          <Button
            label="공부 종료"
            tone="primary"
            onPress={() =>
              router.push({
                pathname: "/capture",
                params: { kind: "end", sessionId: open.id, startedAt: open.started_at },
              })
            }
          />
        </View>
      ) : (
        <Button
          label="공부 시작"
          tone="primary"
          onPress={() => router.push({ pathname: "/capture", params: { kind: "start" } })}
        />
      )}
    </ScrollView>
  );
}
