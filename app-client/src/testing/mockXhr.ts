/**
 * multipart 업로드는 fetch 가 아니라 XMLHttpRequest 로 나간다
 * (client.ts 의 sendForm 참고). 그래서 사진 업로드를 지나는 테스트는
 * fetch 가 아니라 이쪽을 목킹해야 한다.
 *
 * 전에는 fetch 만 목킹해서, 실기기에서 업로드가 통째로 죽어 있는데도
 * 테스트가 전부 초록이었다.
 */
export type SentRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: FormData;
};

type Reply = { ok: true; status: number; body: unknown } | { ok: false };

export type XhrMock = {
  sent: SentRequest[];
  /** 기본 응답을 정한다. 큐가 비면 이걸 돌려준다. */
  reply: (status: number, body: unknown) => void;
  /** 기본을 네트워크 실패로 둔다. */
  fail: () => void;
  /** 한 번만 이 응답을 주고 그 다음부터 기본으로 돌아간다. */
  replyOnce: (status: number, body: unknown) => void;
  /** 한 번만 네트워크 실패. 재시도 경로를 볼 때 쓴다. */
  failOnce: () => void;
  restore: () => void;
};

export function installXhrMock(): XhrMock {
  const original = (global as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  const DEFAULT: Reply = {
    ok: true,
    status: 200,
    body: { result: "pass", photo_id: "p1", reason: "", session: null },
  };
  let fallback: Reply = DEFAULT;
  const queue: Reply[] = [];
  const sent: SentRequest[] = [];

  class MockXHR {
    status = 0;
    responseText = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    private record: SentRequest = { method: "", url: "", headers: {}, body: new FormData() };

    open(method: string, url: string) {
      this.record.method = method;
      this.record.url = url;
    }
    setRequestHeader(key: string, value: string) {
      this.record.headers[key] = value;
    }
    send(body: FormData) {
      this.record.body = body;
      sent.push(this.record);
      const reply = queue.shift() ?? fallback;
      if (!reply.ok) {
        this.onerror?.();
        return;
      }
      this.status = reply.status;
      this.responseText = JSON.stringify(reply.body);
      this.onload?.();
    }
  }

  (global as { XMLHttpRequest?: unknown }).XMLHttpRequest = MockXHR;

  return {
    sent,
    reply: (status, body) => {
      fallback = { ok: true, status, body };
    },
    fail: () => {
      fallback = { ok: false };
    },
    replyOnce: (status, body) => {
      queue.push({ ok: true, status, body });
    },
    failOnce: () => {
      queue.push({ ok: false });
    },
    restore: () => {
      (global as { XMLHttpRequest?: unknown }).XMLHttpRequest = original;
    },
  };
}
