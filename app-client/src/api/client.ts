import { apiBaseUrl } from "../config";

export type ErrorKind = "auth" | "payment" | "forbidden" | "conflict" | "other";

const KIND_BY_STATUS: Record<number, ErrorKind> = {
  401: "auth",
  402: "payment",
  403: "forbidden",
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
  body?: unknown,
  form?: FormData
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { ...(init.headers as object) };
  if (token) headers.Authorization = `Bearer ${token}`;
  // multipart 는 boundary 를 런타임이 붙인다. 직접 정하면 서버가 못 읽는다.
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
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

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST" }, body ?? {}),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH" }, body),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT" }, body),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST" }, undefined, form),
};
