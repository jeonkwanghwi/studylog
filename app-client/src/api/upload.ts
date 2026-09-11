import { api } from "./client";
import type { JudgeResultOut } from "./types";

export type ShotKind = "start" | "end";

/**
 * 사진을 올리고 판정 결과를 받는다. 서버가 같은 요청 안에서 AI 판정까지
 * 끝내므로 응답이 곧 결과다 — 폴링할 것이 없다.
 */
export async function uploadPhoto(
  kind: ShotKind,
  uri: string,
  sessionId?: string
): Promise<JudgeResultOut> {
  if (kind === "end" && !sessionId) {
    throw new Error("종료 샷에는 세션 id 가 필요합니다.");
  }

  const form = new FormData();
  form.append("image", {
    uri,
    name: "shot.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  const path = kind === "start" ? "/sessions/start" : `/sessions/${sessionId}/end`;
  return api.postForm<JudgeResultOut>(path, form);
}
