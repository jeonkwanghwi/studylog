import { router } from "expo-router";
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { useCurrentChallenge, useCurrentSession, useMe, useRecords } from "../../src/api/hooks";
import type { ChallengeOut, DailyRecordOut } from "../../src/api/types";
import { Amount } from "../../src/design/Amount";
import { Button } from "../../src/design/Button";
import { Card } from "../../src/design/Card";
import { DayGrid, isoDateAtOffset, type Mark } from "../../src/design/DayGrid";
import { LoadFailed } from "../../src/design/LoadFailed";
import { ScreenTitle } from "../../src/design/ScreenTitle";
import { ScreenSkeleton } from "../../src/design/Skeleton";
import { useScreenPadding } from "../../src/design/safeArea";
import { T } from "../../src/design/Text";
import { color, space } from "../../src/design/tokens";
import { formatWon } from "../../src/money/format";
import { elapsedMinutes, formatElapsed, remainingBeforeForfeit } from "../../src/time/elapsed";
import { studyDayOf } from "../../src/time/studyDay";

const WARN_UNDER_MINUTES = 30;

function monthLabel(dateISO: string): string {
  return `${Number(dateISO.slice(5, 7))}월`;
}

/**
 * 이 챌린지가 실제로 돌려준 금액. credit_balance는 크레딧 지갑 전체(다른
 * 챌린지의 잔여분, 스트릭 복구로 쓴 지출까지 뒤섞여 있다)라 이 챌린지의
 * 페이백과 다르다. 서버가 하루치를 확정하는 규칙과 같은 창(started_on..ends_on,
 * 양끝 포함)으로 걸러야 두 계산이 어긋나지 않는다.
 */
function earnedInChallenge(records: DailyRecordOut[], challenge: ChallengeOut): number {
  return records
    .filter((r) => r.date >= challenge.started_on && r.date <= challenge.ends_on)
    .reduce((sum, r) => sum + r.payback_amount, 0);
}

function dayMarks(records: DailyRecordOut[], challenge: ChallengeOut): Mark[] {
  return Array.from({ length: challenge.total_days }, (_, i) => {
    const date = isoDateAtOffset(challenge.started_on, i);
    const record = records.find((r) => r.date === date);
    if (record?.result === "success" || record?.result === "passed") return "secured";
    if (record?.result === "failed") return "missed";
    return "pending";
  });
}

export default function Home() {
  const screenPadding = useScreenPadding();
  const me = useMe();
  const session = useCurrentSession();
  const challenge = useCurrentChallenge();
  const records = useRecords();

  // 화면 표시용 재계산일 뿐이다 — 경과 시간의 근거는 서버가 준 started_at 뿐이고,
  // 이 컴포넌트는 매초 다시 그리기 위해 now 만 갱신한다.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // 세션 로딩 중엔 아직 "공부 시작"인지 "공부 종료"인지 알 수 없다. 여기서
  // 새로 그리지 않으면, 열린 세션이 있는데도 잠깐 "공부 시작"이 보여 탭하는
  // 순간 사진 한 장과 유료 AI 판정 호출이 409로 날아간다.
  if (session.isLoading) {
    return <ScreenSkeleton />;
  }

  // 조회가 실패했는데 data 를 "없음"으로 읽으면, 열려 있는 세션의 4시간 폐기
  // 경고가 통째로 사라지고 "공부 시작"이 뜬다. 활성 챌린지 쪽은 더 나쁘다 —
  // "챌린지 시작"이 떠서 재구매로 이어지면 서버는 이미 활성 챌린지가 있다는
  // 이유로 두 번째 챌린지를 열어주지 않고 영수증만 남는다.
  if (session.isError || challenge.isError) {
    return (
      <LoadFailed
        what="현재 상태"
        onRetry={() => {
          session.refetch();
          challenge.refetch();
        }}
      />
    );
  }

  // open 만 진행 중인 세션이다. abandoned·closed 는 시작 전 상태로 취급한다.
  const open = session.data?.status === "open" ? session.data : null;
  const activeChallenge = challenge.data ?? null;
  const earned = activeChallenge ? earnedInChallenge(records.data ?? [], activeChallenge) : 0;
  const remainingAtStake = activeChallenge
    ? Math.max(0, activeChallenge.entry_amount - earned)
    : 0;
  const marks = activeChallenge ? dayMarks(records.data ?? [], activeChallenge) : [];
  const remaining = open ? remainingBeforeForfeit(open.started_at, now) : 0;

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.xl, ...screenPadding }}
      refreshControl={
        <RefreshControl
          refreshing={records.isFetching && !records.isLoading}
          onRefresh={() => {
            session.refetch();
            challenge.refetch();
            records.refetch();
            me.refetch();
          }}
          tintColor={color.textMuted}
        />
      }
    >
      <ScreenTitle
        title={`${me.data?.nickname ?? ""}님`}
        subtitle={`${me.data?.streak_count ?? 0}일째 이어가는 중`}
      />

      {activeChallenge ? (
        <View style={{ gap: space.sm }}>
          <T variant="caption" kind="muted">
            아직 못 받은 돈
          </T>
          <Amount value={remainingAtStake} size="hero" roll />
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
            marks={marks}
            today={studyDayOf(now)}
          />
        </Card>
      )}

      {open ? (
        <View style={{ gap: space.base }}>
          <T variant="section" kind="sub">{open.activity}</T>
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
          onPress={() => router.push("/declare")}
        />
      )}
    </ScrollView>
  );
}
