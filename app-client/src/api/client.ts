import { apiBaseUrl } from "../config";

export type ErrorKind =
  | "auth"
  | "payment"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "other";

const KIND_BY_STATUS: Record<number, ErrorKind> = {
  401: "auth",
  402: "payment",
  403: "forbidden",
  404: "notFound",
  409: "conflict",
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly kind: ErrorKind
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;

/** 앱 시작 시 한 번 주입한다. 화면이 토큰을 직접 만지지 않게 하는 장치다. */
export function setTokenGetter(getter: TokenGetter): void {
  getToken = getter;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  body?: unknown
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { ...(init.headers as object) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      (payload as { detail?: string }).detail ?? "요청을 처리하지 못했습니다.",
      KIND_BY_STATUS[response.status] ?? "other"
    );
  }
  return payload as T;
}

/**
 * multipart 는 fetch 가 아니라 XMLHttpRequest 로 보낸다.
 *
 * Expo 가 fetch 를 자체 구현으로 대체했는데, 그쪽은 React Native 의
 * `{ uri, name, type }` 파일 파트를 모르고 "Unsupported FormDataPart
 * implementation" 으로 던진다. expo-file-system 의 File 로 우회해봤지만
 * 카메라 캐시 경로를 네이티브 validatePath 가 거부한다.
 *
 * XHR 은 Expo 가 건드리지 않고 RN 이 그대로 제공한다. 파일을 디스크에서
 * 바로 스트리밍하므로 수 MB 사진이 JS 메모리에 올라오지도 않는다.
 */
function sendForm<T>(path: string, form: FormData, token: string | null): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBaseUrl()}${path}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    // Content-Type 을 직접 정하지 않는다 — boundary 를 런타임이 붙인다.

    xhr.onload = () => {
      let payload: unknown = {};
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        // 본문이 JSON 이 아니면 아래에서 기본 문구로 처리한다
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as T);
        return;
      }
      reject(
        new ApiError(
          xhr.status,
          (payload as { detail?: string }).detail ?? "요청을 처리하지 못했습니다.",
          KIND_BY_STATUS[xhr.status] ?? "other"
        )
      );
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "사진을 올리지 못했습니다. 연결을 확인해주세요.", "other"));
    xhr.ontimeout = () =>
      reject(new ApiError(0, "사진 업로드가 시간 초과됐습니다.", "other"));

    xhr.send(form);
  });
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST" }, body ?? {}),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH" }, body),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT" }, body),
  postForm: async <T>(path: string, form: FormData) =>
    sendForm<T>(path, form, await getToken()),
  // 204 는 본문이 없다. request 가 빈 본문을 {} 로 바꿔주므로 그대로 쓴다.
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
