import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { api, setTokenGetter } from "../api/client";
import type { LoginOut, UserOut } from "../api/types";
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
