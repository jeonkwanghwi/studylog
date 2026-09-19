import { api } from "./client";
import type { JudgeResultOut } from "./types";

export type ShotKind = "start" | "end";

export type UploadOptions = {
  /** 종료 샷에 필요하다. */
  sessionId?: string;
  /** 시작 샷에 필요하다 — 판정은 이 선언과 사진을 대조해서 이뤄진다. */
  activity?: string;
};

/**
 * 사진을 올리고 판정 결과를 받는다. 서버가 같은 요청 안에서 AI 판정까지
 * 끝내므로 응답이 곧 결과다 — 폴링할 것이 없다.
 *
 * 파일 파트는 React Native 의 `{ uri, name, type }` 형태다. 이 형태는
 * XMLHttpRequest 로만 통한다(client.ts 의 sendForm 참고) — Expo 가 대체한
 * fetch 는 이걸 모르고, expo-file-system 의 File 은 카메라 캐시 경로를
 * 네이티브에서 거부한다.
 */
export async function uploadPhoto(
  kind: ShotKind,
  uri: string,
  { sessionId, activity }: UploadOptions = {}
): Promise<JudgeResultOut> {
  // 빈 경로로 파일 파트를 만들면 네이티브가 그 파일을 열려다 앱을 죽인다.
  // JS 예외로 바꿔서 화면이 에러를 보여줄 수 있게 한다.
  if (!uri) {
    throw new Error("사진이 없습니다. 다시 찍어주세요.");
  }
  if (kind === "end" && !sessionId) {
    throw new Error("종료 샷에는 세션 id 가 필요합니다.");
  }
  // 선언이 없으면 서버가 422로 되돌려보낸다. 유료 판정 호출까지 가기 전에 막는다.
  if (kind === "start" && !activity?.trim()) {
    throw new Error("시작 샷에는 무엇을 할지 선언이 필요합니다.");
  }

  const form = new FormData();
  form.append("image", {
    uri,
    name: "shot.jpg",
    type: "image/jpeg",
  } as unknown as Blob);
  if (kind === "start") form.append("activity", activity!.trim());

  const path = kind === "start" ? "/sessions/start" : `/sessions/${sessionId}/end`;
  return api.postForm<JudgeResultOut>(path, form);
}
