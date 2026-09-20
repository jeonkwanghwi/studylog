import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { ApiError, api } from "../../src/api/client";
import { keys, useGroups } from "../../src/api/hooks";
import type { GroupOut } from "../../src/api/types";
import { BackButton } from "../../src/design/BackButton";
import { Button } from "../../src/design/Button";
import { Field } from "../../src/design/Field";
import { Card } from "../../src/design/Card";
import { useScreenPadding } from "../../src/design/safeArea";
import { ScreenTitle } from "../../src/design/ScreenTitle";
import { T } from "../../src/design/Text";
import { Toast, useToast } from "../../src/design/Toast";
import { Touchable } from "../../src/design/Touchable";
import { space } from "../../src/design/tokens";

const CODE_LENGTH = 6;

export default function Groups() {
  const screenPadding = useScreenPadding();
  const groups = useGroups();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const toast = useToast();

  const list = groups.data ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: keys.groups });
  }

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.post<GroupOut>("/groups", { name: name.trim() });
      setName("");
      await refresh();
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : "그룹을 만들지 못했습니다.";
      Alert.alert("만들기 실패", detail);
    } finally {
      setCreating(false);
    }
  }

  async function join() {
    if (code.length !== CODE_LENGTH) return;
    setJoining(true);
    try {
      // 이미 가입한 그룹이면 서버가 200을 멱등하게 돌려준다 — 실패가 아니다.
      await api.post<GroupOut>("/groups/join", { invite_code: code });
      setCode("");
      await refresh();
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : "참여하지 못했습니다.";
      Alert.alert("참여 실패", detail);
    } finally {
      setJoining(false);
    }
  }

  async function share(group: GroupOut) {
    // 딥링크가 아니라 코드를 복사한다 — 사람이 채팅방에 그대로 붙여넣는다.
    await Clipboard.setStringAsync(`스터디로그 초대코드: ${group.invite_code}`);
    toast.show("초대코드를 복사했어요");
  }

  return (
    <>
    <ScrollView
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ padding: space.xl, gap: space.xl, ...screenPadding }}
    >
      <BackButton />
      <ScreenTitle title="그룹" subtitle="같이 하는 사람이 있을 때 더 오래 갑니다." />

      {list.length === 0 && !groups.isLoading ? (
        <T variant="body" kind="sub">
          아직 그룹이 없습니다. 그룹을 만들거나 초대코드로 참여해보세요.
        </T>
      ) : (
        <View style={{ gap: space.md }}>
          {list.map((group) => (
            <Touchable key={group.id} accessibilityRole="button" onPress={() => share(group)}>
              <Card elevation="raised" style={{ gap: space.xs }}>
                <T variant="section">{group.name}</T>
                <T variant="body" kind="sub" style={{ letterSpacing: 2 }}>
                  {group.invite_code}
                </T>
                <T variant="caption" kind="muted">
                  눌러서 초대코드 복사
                </T>
              </Card>
            </Touchable>
          ))}
        </View>
      )}

      <View style={{ gap: space.md }}>
        <T variant="section">새 그룹</T>
        <Field
          value={name}
          onChangeText={setName}
          maxLength={20}
          placeholder="그룹 이름"
        />
        <Button label="그룹 만들기" tone="secondary" disabled={creating} onPress={create} />
      </View>

      <View style={{ gap: space.md }}>
        <T variant="section">초대코드로 참여</T>
        <Field
          value={code}
          onChangeText={(next) => setCode(next.toUpperCase().slice(0, CODE_LENGTH))}
          placeholder="초대코드 6자리"
          autoCapitalize="characters"
          maxLength={CODE_LENGTH}
          style={{ letterSpacing: 4 }}
        />
        <Button label="참여" tone="primary" disabled={joining} onPress={join} />
      </View>
    </ScrollView>
    <Toast message={toast.message} onHide={toast.hide} />
    </>
  );
}
