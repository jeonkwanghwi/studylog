import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { AppState } from "react-native";

import { api, setTokenGetter } from "../api/client";
import type { LoginOut, UserOut } from "../api/types";
import { needsRefresh } from "./expiry";
import { clearToken, loadToken, saveToken } from "./storage";

setTokenGetter(loadToken);

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: token, isLoading } = useQuery({
    queryKey: ["token"],
    queryFn: loadToken,
    staleTime: Infinity,
  });

  // 토큰은 90일짜리다. 갱신하지 않으면 매일 쓰던 사람도 90일째에 예고 없이
  // 로그아웃된다. 앱을 열 때마다 만료가 가까운지 보고, 가까우면 조용히 바꾼다.
  // 실패해도 아무 일도 하지 않는다 — 아직 쓸 수 있는 토큰이고, 다음에
  // 앱을 열 때 다시 시도한다.
  useEffect(() => {
    const check = async () => {
      const current = await loadToken();
      if (!current || !needsRefresh(current)) return;
      try {
        const out = await api.post<LoginOut>("/auth/refresh");
        await saveToken(out.access_token);
        queryClient.setQueryData(["token"], out.access_token);
      } catch {
        // 네트워크가 없거나 서버가 죽었을 뿐이다. 다음 기회에.
      }
    };
    check();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    // 일부 환경(테스트 포함)에서는 구독 객체를 돌려주지 않는다.
    return () => sub?.remove?.();
  }, [queryClient]);

  const signIn = useCallback(
    async (provider: "apple" | "google" | "kakao", idToken: string, nickname: string) => {
      const out = await api.post<LoginOut>("/auth/social", {
        provider,
        id_token: idToken,
        nickname,
      });
      await saveToken(out.access_token);
      queryClient.setQueryData(["token"], out.access_token);
      queryClient.setQueryData(["me"], out.user);
    },
    [queryClient]
  );

  const signOut = useCallback(async () => {
    await clearToken();
    // 이전 유저의 캐시(me/session/records...)가 다음 로그인까지 남으면 안 된다.
    // token 쿼리는 지금 이 훅이 구독 중이라, clear()로 통째로 지우면
    // 옵저버가 빈 쿼리를 다시 붙잡고 SecureStore를 재조회해 방금 지운 값을
    // 덮어쓴다. token만 남기고 나머지 쿼리만 지운다.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "token" });
    queryClient.setQueryData(["token"], null);
  }, [queryClient]);

  const status: AuthStatus = isLoading
    ? "loading"
    : token
      ? "signedIn"
      : "signedOut";

  return {
    status,
    user: queryClient.getQueryData<UserOut>(["me"]) ?? null,
    signIn,
    signOut,
  };
}
